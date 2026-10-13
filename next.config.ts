import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Public deployments must not inherit local testing or payment activation flags.
  ...(process.env.NODE_ENV === "production"
    ? {
        env: {
          KJM_PAYMONGO_TEST: "false",
          PAYMONGO_TEST_ENABLED: "false",
          PAYMONGO_LIVE_ENABLED: "false",
        },
      }
    : {}),
  distDir:
    process.env.NODE_ENV !== "production" &&
    process.env.KJM_PAYMONGO_TEST === "true"
      ? ".next-paymongo-test"
      : ".next",
  serverExternalPackages: ["tesseract.js"],
  outputFileTracingIncludes: {
    "/api/verification/**": [
      "./src/lib/document-ocr-worker.cjs",
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./node_modules/@tesseract.js-data/eng/**/*",
    ],
    "/dashboard/verifications/**": [
      "./src/lib/document-ocr-worker.cjs",
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./node_modules/@tesseract.js-data/eng/**/*",
    ],
  },
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/motorcycle-catalog/**",
      },
    ],
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
