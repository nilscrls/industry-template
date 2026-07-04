import type { Database } from "@repo/db";
import * as schema from "@repo/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";

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

export interface CreateAuthOptions {
  /** Public URL of the API as the browser reaches it, e.g. https://app.example.com/api */
  baseUrl: string;
  db: Database;
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
    database: drizzleAdapter(options.db, { provider: "pg", schema }),
    secret: options.secret,
    baseURL: options.baseUrl,
    // The Next.js rewrite maps <web>/api/auth/* → <api>/auth/*.
    basePath: "/auth",
    trustedOrigins: options.trustedOrigins,
    ...(options.secondaryStorage
      ? { secondaryStorage: options.secondaryStorage }
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
    plugins: [admin({ defaultRole: "member", adminRoles: ["admin"] })],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type SessionData = Auth["$Infer"]["Session"];
export type AuthUser = SessionData["user"];
