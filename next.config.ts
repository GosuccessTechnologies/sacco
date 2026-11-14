import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NOTE: "standalone" output is for self-hosted / Docker deployments.
  // Vercel manages its own build and output — do NOT set output: "standalone"
  // when deploying to Vercel (it causes routing failures).
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  reactStrictMode: false,
  // Tell Next.js NOT to bundle these packages — they contain native binaries
  // or use Node-only APIs and must be loaded from node_modules at runtime.
  serverExternalPackages: ['@prisma/client', '@libsql/client'],
  // Security & HTTPS headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  // Redirect bare HTTP to HTTPS
  async redirects() {
    return [
      {
        source: "/(.*)",
        has: [{ type: "header", key: "x-forwarded-proto", value: "http" }],
        destination: "https://www.sacco.africandivinechurch.org/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
