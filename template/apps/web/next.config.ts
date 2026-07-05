import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { env } from "./src/env";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// A full script-src CSP needs per-request nonces (middleware rewrite of the
// CSP header) — worth doing per-app; the baseline below is app-agnostic.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Meaningful behind TLS only; harmless over plain http in dev.
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // Workspace packages ship TypeScript source — Next compiles them in-place.
  transpilePackages: ["@repo/i18n", "@repo/ui"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
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
