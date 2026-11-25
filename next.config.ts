import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "pdfkit", "archiver"],
};

export default nextConfig;
