import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import "./src/env";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    // Same-origin API: the browser only ever talks to /api/* on this host.
    // In production the reverse proxy routes /api instead (see compose prod).
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_URL ?? "http://localhost:3001"}/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
