import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

// Remote AI runs only for news requests; the production build does not initialize a proxy.
if (process.env.NODE_ENV === "development") initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
