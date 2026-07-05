"use client";

import {
  adminClient,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL:
    typeof window === "undefined"
      ? "http://localhost:3000/api/auth"
      : `${window.location.origin}/api/auth`,
  plugins: [
    adminClient(),
    organizationClient(),
    twoFactorClient({
      onTwoFactorRedirect() {
        // Sign-in succeeded but the account requires a second factor.
        window.location.href = "/two-factor";
      },
    }),
  ],
});

export type ClientSession = typeof authClient.$Infer.Session;
