import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pdfjs-dist"],
  // E2E coverage build only (CI): browser source maps let the coverage report map client code back to src/app.
  productionBrowserSourceMaps: process.env.NEXO_COVERAGE === "1",
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
  // ponytail: no script CSP (Next's inline scripts would need nonces); add one if the threat model grows.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
