import { randomUUID } from "node:crypto";
import type { Database } from "@repo/db";
import * as schema from "@repo/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { admin, organization, twoFactor } from "better-auth/plugins";
import { eq } from "drizzle-orm";

export interface DeletedUser {
  email: string;
  id: string;
}

export interface MembershipEvent {
  organizationId: string;
  userId: string;
}

export interface AuthEmail {
  to: string;
  type: "verify-email" | "reset-password";
  url: string;
  userName: string;
}

export type SendAuthEmail = (email: AuthEmail) => Promise<void>;

/**
 * Single-organization mode: the one tenant every user joins at signup. The
 * first signup creates it; the slug doubles as the idempotency key for that
 * bootstrap. Rename the organization from the database or an admin tool —
 * the app never re-reads this constant after the org exists.
 */
const DEFAULT_ORG = { name: "Workspace", slug: "workspace" } as const;

export interface SecondaryStorage {
  delete: (key: string) => Promise<void>;
  get: (key: string) => Promise<string | null>;
  /**
   * Atomically increment `key` and return the post-increment count,
   * creating it with `ttl` (seconds) on first increment. Better-Auth's
   * rate limiter uses this for strict accounting; without it the limiter
   * falls back to best-effort read-then-write and warns at runtime.
   */
  increment?: (key: string, ttl: number) => Promise<number>;
  set: (key: string, value: string, ttl?: number) => Promise<void>;
}

export interface MicrosoftSsoOptions {
  clientId: string;
  clientSecret: string;
  /** Entra directory (tenant) id — or `common` for multi-tenant sign-in. */
  tenantId: string;
}

export interface CreateAuthOptions {
  /** Public URL of the API as the browser reaches it, e.g. https://app.example.com/api */
  /**
   * Full public base of the auth endpoints as the BROWSER reaches them,
   * e.g. https://app.example.com/api/auth.
   */
  baseUrl: string;
  /**
   * Scope auth cookies to a parent domain (e.g. "example.com") so sibling
   * subdomains share the session — set when the browser talks to the api on
   * its own subdomain instead of through the web app's /api proxy.
   */
  cookieDomain?: string;
  db: Database;
  /**
   * Microsoft Entra ID OIDC connection. Adding another provider later is a
   * config addition here + a `socialProviders` entry, not a rewrite.
   */
  microsoft?: MicrosoftSsoOptions;
  /**
   * Runs after a user account was deleted (rows already cascaded) — the api
   * wires blob cleanup and the audit trail here. Seeds pass nothing.
   */
  onAfterUserDelete?: (user: DeletedUser) => Promise<void>;
  /**
   * Runs before a user account is deleted. Throw an Error to block the
   * deletion — its message is returned to the client (e.g. "transfer your
   * organizations first").
   */
  onBeforeUserDelete?: (user: DeletedUser) => Promise<void>;
  /**
   * Membership lifecycle callbacks — the api mirrors them into OpenFGA
   * tuples. Seeds pass nothing and run `pnpm fga:sync` instead.
   */
  onMemberAdded?: (event: MembershipEvent) => Promise<void>;
  onMemberRemoved?: (event: MembershipEvent) => Promise<void>;
  onOrganizationCreated?: (event: MembershipEvent) => Promise<void>;
  onOrganizationDeleted?: (event: { organizationId: string }) => Promise<void>;
  /**
   * Turn on Better-Auth's built-in rate limiter (the api wires this to
   * AUTH_RATE_LIMIT_ENABLED). Off by default so seeds and scripts that
   * call createAuth() directly never trip it.
   */
  rateLimitEnabled?: boolean;
  requireEmailVerification?: boolean;
  /** Redis-backed session/rate-limit storage — recommended in production. */
  secondaryStorage?: SecondaryStorage;
  secret: string;
  /** The api app wires this to the BullMQ mail queue; seeds pass a no-op. */
  sendEmail: SendAuthEmail;
  trustedOrigins: string[];
}

export function createAuth(options: CreateAuthOptions) {
  return betterAuth({
    appName: "Industry App",
    database: drizzleAdapter(options.db, { provider: "pg", schema }),
    secret: options.secret,
    // NOTE: a path inside baseURL replaces basePath entirely — the path of
    // baseUrl IS the mount path better-auth matches requests against, and
    // the base for generated links (verification emails, redirects).
    baseURL: options.baseUrl,
    trustedOrigins: options.trustedOrigins,
    // Parent-domain cookie (Domain=<cookieDomain>): app.<domain> and
    // api.<domain> are same-site, so SameSite=Lax keeps working.
    ...(options.cookieDomain
      ? {
          advanced: {
            crossSubDomainCookies: {
              enabled: true,
              domain: options.cookieDomain,
            },
          },
        }
      : {}),
    // The /auth/* express mount bypasses the Nest ThrottlerGuard, so this
    // built-in limiter is the only rate limit on auth endpoints. Counters
    // are keyed per IP+path (x-forwarded-for; localhost fallback in
    // dev/test) and live in secondaryStorage (Redis) when provided —
    // shared across instances, atomic via SecondaryStorage.increment.
    rateLimit: {
      enabled: options.rateLimitEnabled ?? false,
      // Baseline for every auth route (get-session is hot; NATs share IPs).
      window: 10,
      max: 100,
      // Credential endpoints get tight per-minute buckets. Pinned here —
      // not left to better-auth's built-ins — so the policy survives
      // library upgrades. Paths are relative to the baseURL path.
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 10 },
        "/forget-password": { window: 60, max: 3 },
        "/request-password-reset": { window: 60, max: 3 },
        "/two-factor/*": { window: 10, max: 3 },
      },
      ...(options.secondaryStorage
        ? { storage: "secondary-storage" as const }
        : {}),
    },
    ...(options.secondaryStorage
      ? { secondaryStorage: options.secondaryStorage }
      : {}),
    ...(options.microsoft
      ? {
          socialProviders: {
            microsoft: {
              clientId: options.microsoft.clientId,
              clientSecret: options.microsoft.clientSecret,
              tenantId: options.microsoft.tenantId,
              prompt: "select_account" as const,
            },
          },
        }
      : {}),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: options.requireEmailVerification ?? false,
      sendResetPassword: async ({ user, url }) => {
        await options.sendEmail({
          type: "reset-password",
          to: user.email,
          userName: user.name,
          url,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await options.sendEmail({
          type: "verify-email",
          to: user.email,
          userName: user.name,
          url,
        });
      },
    },
    session: {
      // Short-lived signed cookie cache: most requests skip the store lookup.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    user: {
      // GDPR right to erasure: self-service, re-authenticated with the
      // password (authClient.deleteUser({ password })). DB rows cascade via
      // FKs; audit_log.actorId is SET NULL — the trail survives, anonymized.
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          try {
            await options.onBeforeUserDelete?.({
              id: user.id,
              email: user.email,
            });
          } catch (error) {
            throw new APIError("BAD_REQUEST", {
              message:
                error instanceof Error
                  ? error.message
                  : "Account deletion is blocked",
            });
          }
        },
        afterDelete: async (user) => {
          await options.onAfterUserDelete?.({
            id: user.id,
            email: user.email,
          });
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Single-org mode: every new user (email signup, SSO, admin-created)
          // lands in the one workspace. The first user bootstraps it and
          // becomes its owner; later users join as members. These are direct
          // inserts — the organization plugin's hooks do NOT fire — so the
          // FGA mirror callbacks are invoked explicitly (the api wires them
          // to tuple writes; seeds pass nothing and run `pnpm fga:sync`).
          after: async (user) => {
            const [existing] = await options.db
              .select({ id: schema.organization.id })
              .from(schema.organization)
              .orderBy(schema.organization.createdAt)
              .limit(1);
            let organizationId = existing?.id;
            let bootstrapped = false;
            if (!organizationId) {
              const inserted = await options.db
                .insert(schema.organization)
                .values({
                  id: randomUUID(),
                  name: DEFAULT_ORG.name,
                  slug: DEFAULT_ORG.slug,
                })
                .onConflictDoNothing({ target: schema.organization.slug })
                .returning({ id: schema.organization.id });
              if (inserted[0]) {
                organizationId = inserted[0].id;
                bootstrapped = true;
              } else {
                // Lost a concurrent bootstrap race — join the winner's org.
                const [winner] = await options.db
                  .select({ id: schema.organization.id })
                  .from(schema.organization)
                  .where(eq(schema.organization.slug, DEFAULT_ORG.slug));
                organizationId = winner?.id;
              }
            }
            if (!organizationId) {
              throw new Error("Could not provision the default organization");
            }
            await options.db.insert(schema.member).values({
              id: randomUUID(),
              organizationId,
              userId: user.id,
              role: bootstrapped ? "owner" : "member",
            });
            if (bootstrapped) {
              await options.onOrganizationCreated?.({
                organizationId,
                userId: user.id,
              });
            } else {
              await options.onMemberAdded?.({
                organizationId,
                userId: user.id,
              });
            }
          },
        },
      },
      session: {
        create: {
          // New sessions start in the user's first organization — in
          // single-org mode that is always the workspace (auto-joined above).
          before: async (session) => {
            const memberships = await options.db
              .select({ organizationId: schema.member.organizationId })
              .from(schema.member)
              .where(eq(schema.member.userId, session.userId))
              .limit(1);
            return {
              data: {
                ...session,
                activeOrganizationId: memberships[0]?.organizationId ?? null,
              },
            };
          },
        },
      },
    },
    plugins: [
      admin({ defaultRole: "member", adminRoles: ["admin"] }),
      organization({
        // Single-org mode: the workspace is provisioned by the signup hook
        // above; nobody creates organizations from the client.
        allowUserToCreateOrganization: false,
        organizationHooks: {
          afterCreateOrganization: async ({ organization, user }) => {
            await options.onOrganizationCreated?.({
              organizationId: organization.id,
              userId: user.id,
            });
          },
          afterDeleteOrganization: async ({ organization }) => {
            await options.onOrganizationDeleted?.({
              organizationId: organization.id,
            });
          },
          afterAddMember: async ({ member }) => {
            await options.onMemberAdded?.({
              organizationId: member.organizationId,
              userId: member.userId,
            });
          },
          afterRemoveMember: async ({ member }) => {
            await options.onMemberRemoved?.({
              organizationId: member.organizationId,
              userId: member.userId,
            });
          },
        },
      }),
      // Opt-in per user (TOTP + backup codes); nothing is gated on it.
      twoFactor(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type SessionData = Auth["$Infer"]["Session"];
export type AuthUser = SessionData["user"];
