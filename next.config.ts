import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pdfjs-dist"],
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
};

export default nextConfig;
