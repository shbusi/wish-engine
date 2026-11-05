import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "ffmpeg-static", "@resvg/resvg-js"],
};

export default nextConfig;
