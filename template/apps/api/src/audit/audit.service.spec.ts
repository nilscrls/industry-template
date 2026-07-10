import type { SessionData } from "@repo/auth";
import { describe, expect, it, vi } from "vitest";
import { requestContext } from "../common/request-context";
import type { DbService } from "../db/db.module";
import { AuditService } from "./audit.service";

function makeService() {
  const values = vi.fn().mockResolvedValue(undefined);
  const db = { insert: vi.fn().mockReturnValue({ values }) };
  const dbService = {
    db,
    // The real tenant() opens an RLS-scoped transaction; here it just hands
    // the same mock db to the callback.
    tenant: (fn: (tx: typeof db) => unknown) => fn(db),
  } as unknown as DbService;
  return { service: new AuditService(dbService), values };
}

function contextFor(organizationId: string | null) {
  return {
    requestId: "req-1",
    user: { id: "user-1" } as SessionData["user"],
    session: {
      session: { activeOrganizationId: organizationId },
      user: { id: "user-1" },
    } as unknown as SessionData,
  };
}

describe("AuditService.audited", () => {
  it("records after the handler succeeds, with context and default entity id", async () => {
    const { service, values } = makeService();
    const middleware = service.audited({
      action: "project.update",
      entityType: "Project",
    });

    const result = await requestContext.run(contextFor("org-1"), () =>
      middleware(
        { next: () => ({ output: { id: "entity-1", name: "n" } }) },
        { id: "entity-1", name: "n" }
      )
    );

    expect(result.output).toEqual({ id: "entity-1", name: "n" });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        actorId: "user-1",
        action: "project.update",
        entityType: "Project",
        entityId: "entity-1",
        payload: { id: "entity-1", name: "n" },
        requestId: "req-1",
      })
    );
  });

  it("prefers the explicit entityId extractor", async () => {
    const { service, values } = makeService();
    const middleware = service.audited<
      { fileName: string },
      { file: { id: string } }
    >({
      action: "file.upload",
      entityType: "File",
      entityId: (_input, output) => output.file.id,
    });

    await requestContext.run(contextFor("org-1"), () =>
      middleware(
        { next: () => ({ output: { file: { id: "file-9" } } }) },
        { fileName: "report.pdf" }
      )
    );

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "file-9" })
    );
  });

  it("does not write when the handler throws", async () => {
    const { service, values } = makeService();
    const middleware = service.audited({
      action: "project.delete",
      entityType: "Project",
    });

    await expect(
      requestContext.run(contextFor("org-1"), () =>
        middleware(
          {
            next: () => {
              throw new Error("boom");
            },
          },
          { id: "x" }
        )
      )
    ).rejects.toThrow("boom");
    expect(values).not.toHaveBeenCalled();
  });
});
