import { CredentialsMethod, OpenFgaClient } from "@openfga/sdk";

export interface FgaClientOptions {
  apiToken: string;
  apiUrl: string;
  /** Pin a model id in production; omit to use the store's latest model. */
  modelId?: string | undefined;
  /** Omit only for store-management calls (createStore/listStores). */
  storeId?: string | undefined;
}

export function createFgaClient(options: FgaClientOptions): OpenFgaClient {
  return new OpenFgaClient({
    apiUrl: options.apiUrl,
    ...(options.storeId ? { storeId: options.storeId } : {}),
    ...(options.modelId ? { authorizationModelId: options.modelId } : {}),
    credentials: {
      method: CredentialsMethod.ApiToken,
      config: { token: options.apiToken },
    },
  });
}

export type { OpenFgaClient } from "@openfga/sdk";
