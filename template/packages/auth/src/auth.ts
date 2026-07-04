import type { Database } from "@repo/db";
import * as schema from "@repo/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";

export type AuthEmail = {
  type: "verify-email" | "reset-password";
  to: string;
  userName: string;
  url: string;
};

export type SendAuthEmail = (email: AuthEmail) => Promise<void>;

export type SecondaryStorage = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ttl?: number) => Promise<void>;
  delete: (key: string) => Promise<void>;
};

export type CreateAuthOptions = {
  db: Database;
  secret: string;
  /** Public URL of the API as the browser reaches it, e.g. https://app.example.com/api */
  baseUrl: string;
  trustedOrigins: string[];
  /** The api app wires this to the BullMQ mail queue; seeds pass a no-op. */
  sendEmail: SendAuthEmail;
  /** Redis-backed session/rate-limit storage — recommended in production. */
  secondaryStorage?: SecondaryStorage;
  requireEmailVerification?: boolean;
};

export function createAuth(options: CreateAuthOptions) {
  return betterAuth({
    database: drizzleAdapter(options.db, { provider: "pg", schema }),
    secret: options.secret,
    baseURL: options.baseUrl,
    // The Next.js rewrite maps <web>/api/auth/* → <api>/auth/*.
    basePath: "/auth",
    trustedOrigins: options.trustedOrigins,
    ...(options.secondaryStorage ? { secondaryStorage: options.secondaryStorage } : {}),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: options.requireEmailVerification ?? false,
      sendResetPassword: async ({ user, url }) => {
        await options.sendEmail({ type: "reset-password", to: user.email, userName: user.name, url });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await options.sendEmail({ type: "verify-email", to: user.email, userName: user.name, url });
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
