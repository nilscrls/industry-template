import { createApp } from "./app.setup";
import { env } from "./config/env";

async function bootstrap(): Promise<void> {
  const app = await createApp();
  await app.listen(env.API_PORT);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
