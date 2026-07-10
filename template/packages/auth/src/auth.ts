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

export interface AuthEmail {
  to: string;
  type: "verify-email" | "reset-password";
  url: string;
  userName: string;
}

export type SendAuthEmail = (email: AuthEmail) => Promise<void>;

export interface SecondaryStorage {
  delete: (key: string) => Promise<void>;
  get: (key: string) => Promise<string | null>;
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
      session: {
        create: {
          // New sessions start in the user's first organization. Users
          // without any membership get no active org — the API answers with
          // empty lists, never 403 (same rule as fresh users).
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
      organization(),
      // Opt-in per user (TOTP + backup codes); nothing is gated on it.
      twoFactor(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type SessionData = Auth["$Infer"]["Session"];
export type AuthUser = SessionData["user"];
