import { createORPCClient } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import type { JsonifiedClient } from "@orpc/openapi-client";
import { OpenAPILink } from "@orpc/openapi-client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { contract } from "@repo/contracts";
import { env } from "../env";

function resolveBaseUrl(): string {
  if (typeof window === "undefined") {
    // Server side goes straight to the api (docker network / localhost).
    return env.API_URL;
  }
  const publicUrl = env.NEXT_PUBLIC_API_URL;
  return publicUrl.startsWith("http") ? publicUrl : new URL(publicUrl, window.location.origin).toString();
}

const link = new OpenAPILink(contract, {
  url: resolveBaseUrl(),
  fetch: (input, init) => fetch(input, { ...init, credentials: "include" }),
});

/** Fully typed client derived from the shared contract — no codegen. */
export const client: JsonifiedClient<ContractRouterClient<typeof contract>> = createORPCClient(link);

/** TanStack Query helpers: orpc.projects.list.queryOptions({ input }) etc. */
export const orpc = createTanstackQueryUtils(client);
