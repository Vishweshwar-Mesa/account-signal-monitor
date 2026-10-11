import type { NextConfig } from "next";

// Security headers on every response (R4).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Every page is per-user and dynamic, so Cache Components is left off (see docs/DECISIONS.md B02).
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // Migrations and seed files are read at runtime (seed fallback when DATABASE_URL is missing).
  outputFileTracingIncludes: { "/**": ["./supabase/**/*.sql", "./data/seed/*.json"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
