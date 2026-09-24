import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.CLEANOPS_NEXT_DIST_DIR || ".next",
  devIndicators: false,
  reactStrictMode: true,
  serverExternalPackages: ["@napi-rs/canvas", "@tesseract.js-data/eng", "mammoth", "pdfjs-dist", "tesseract.js"],
  outputFileTracingIncludes: {
    "/finance/contracts/*": ["./node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz"],
  },
};

export default nextConfig;
