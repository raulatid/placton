import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El logo del espacio se sube con una acción de servidor (hasta 3 MB).
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
