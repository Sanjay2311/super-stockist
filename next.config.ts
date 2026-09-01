import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;

// OpenNext (Cloudflare) local-dev integration: makes `getCloudflareContext()`
// work under `next dev`. No-op for the production Worker build.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
