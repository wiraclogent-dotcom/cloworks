import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
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
