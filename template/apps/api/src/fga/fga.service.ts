import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  ClientWriteRequestOnDuplicateWrites,
  ClientWriteRequestOnMissingDeletes,
} from "@openfga/sdk";
import { resources } from "@repo/contracts";
import { type OpenFgaClient, ref } from "@repo/fga";
import { appError } from "../common/app-error";
import { currentUser } from "../common/request-context";
import { FGA_CLIENT } from "./fga.constants";

export interface Tuple {
  object: string;
  relation: string;
  user: string;
}

/**
 * Thin authorization façade over the OpenFGA client. Every check is a
 * network call — OpenFGA is a hard runtime dependency; when it is
 * unreachable the guard FAILS CLOSED with a 5xx (never a silent allow, and
 * never a misleading 403).
 */
@Injectable()
export class FgaService {
  constructor(@Inject(FGA_CLIENT) private readonly client: OpenFgaClient) {}

  /** `user` / `org` / `system` / resource object refs — single source. */
  readonly ref = ref;

  /** The signed-in user as an FGA subject. */
  me(): string {
    return ref.user(currentUser().id);
  }

  async check(
    user: string,
    relation: string,
    object: string
  ): Promise<boolean> {
    const { allowed } = await this.guarded(() =>
      this.client.check({ user, relation, object })
    );
    return allowed === true;
  }

  /** Batched check preserving input order. */
  async batchCheck(
    checks: { object: string; relation: string; user: string }[]
  ): Promise<boolean[]> {
    if (checks.length === 0) {
      return [];
    }
    const withIds = checks.map((check) => ({
      ...check,
      correlationId: randomUUID(),
    }));
    const { result } = await this.guarded(() =>
      this.client.batchCheck({ checks: withIds })
    );
    const byId = new Map(
      result.map((item) => [item.correlationId, item.allowed === true])
    );
    return withIds.map((check) => byId.get(check.correlationId) === true);
  }

  /** Which of `relations` the user holds on `object` (permission snapshot). */
  async listRelations(
    user: string,
    object: string,
    relations: string[]
  ): Promise<string[]> {
    const { relations: held } = await this.guarded(() =>
      this.client.listRelations({ user, object, relations })
    );
    return held ?? [];
  }

  /**
   * All tuples for a user, optionally filtered to a relation set. The Read
   * API filters by user only WITHIN an object type, so this sweeps every
   * type in the model (`resources` from @repo/contracts + org/system).
   */
  async readUserTuples(
    user: string,
    relations?: Set<string>
  ): Promise<Tuple[]> {
    const objectTypes = ["org", "system", ...resources];
    const tuples: Tuple[] = [];
    for (const type of objectTypes) {
      let continuationToken: string | undefined;
      do {
        const page = await this.guarded(() =>
          this.client.read(
            { user, object: `${type}:` },
            continuationToken ? { continuationToken } : {}
          )
        );
        tuples.push(...page.tuples.map((tuple) => tuple.key));
        continuationToken = page.continuation_token || undefined;
      } while (continuationToken);
    }
    return relations
      ? tuples.filter((tuple) => relations.has(tuple.relation))
      : tuples;
  }

  /** Idempotent: writing an existing tuple is a no-op, not an error. */
  async writeTuples(tuples: Tuple[]): Promise<void> {
    if (tuples.length > 0) {
      await this.guarded(() =>
        this.client.writeTuples(tuples, {
          conflict: {
            onDuplicateWrites: ClientWriteRequestOnDuplicateWrites.Ignore,
          },
        })
      );
    }
  }

  /** Idempotent: deleting a missing tuple is a no-op, not an error. */
  async deleteTuples(tuples: Tuple[]): Promise<void> {
    if (tuples.length > 0) {
      await this.guarded(() =>
        this.client.deleteTuples(tuples, {
          conflict: {
            onMissingDeletes: ClientWriteRequestOnMissingDeletes.Ignore,
          },
        })
      );
    }
  }

  /** Remove every tuple attached to an object (resource deletion). */
  async deleteObjectTuples(object: string): Promise<void> {
    const tuples: Tuple[] = [];
    let continuationToken: string | undefined;
    do {
      const page = await this.guarded(() =>
        this.client.read(
          { object },
          continuationToken ? { continuationToken } : {}
        )
      );
      tuples.push(...page.tuples.map((tuple) => tuple.key));
      continuationToken = page.continuation_token || undefined;
    } while (continuationToken);
    await this.deleteTuples(tuples);
  }

  private async guarded<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      // Fail closed with a 5xx: an unreachable authz engine is an outage,
      // not a permission decision. Rerun `pnpm fga:sync` after recovery if
      // a post-commit tuple write was lost.
      console.error("OpenFGA call failed", error);
      throw appError("INTERNAL", {});
    }
  }
}
