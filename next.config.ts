import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Brand illustrations live on Cloudinary; the cloud name is public and inlined so client components can build URLs.
  env: { NEXT_PUBLIC_BRAND_CLOUD: process.env.CLOUDINARY_CLOUD_NAME?.trim() ?? "" },
  // Help guides are read from content/help at request time, so serverless deploys must ship that folder.
  outputFileTracingIncludes: {
    "/help": ["./content/help/**/*"],
    "/help/*": ["./content/help/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
