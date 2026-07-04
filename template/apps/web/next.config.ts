import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { env } from "./src/env";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  // Workspace packages ship TypeScript source — Next compiles them in-place.
  transpilePackages: ["@repo/i18n", "@repo/ui"],
  async rewrites() {
    // Same-origin API: the browser only ever talks to /api/* on this host.
    // In production the reverse proxy routes /api instead (see compose prod).
    return [
      {
        source: "/api/:path*",
        destination: `${env.API_URL}/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
