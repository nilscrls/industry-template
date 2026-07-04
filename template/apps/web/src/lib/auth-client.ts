"use client";

import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL:
    typeof window === "undefined"
      ? "http://localhost:3000/api/auth"
      : `${window.location.origin}/api/auth`,
  plugins: [adminClient()],
});

export type ClientSession = typeof authClient.$Infer.Session;
