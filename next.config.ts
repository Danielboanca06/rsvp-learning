import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  // pdfjs-dist requires @napi-rs/canvas conditionally at runtime (for the
  // DOMMatrix/ImageData/Path2D polyfills it needs in Node) — Next's automatic
  // serverless file tracing doesn't detect that dynamic require, so the
  // package gets silently dropped from the deployed function bundle unless
  // forced in explicitly here.
  outputFileTracingIncludes: {
    // pdfjs-dist dynamically requires/imports several files at runtime (the
    // native canvas binary in a sibling package dir, its worker script) that
    // Next's automatic file tracer doesn't detect statically, so they get
    // silently dropped from the deployed function bundle unless forced in.
    // Scoped to just this one route — pdf-parse is only imported here, and an
    // earlier "/**" (every route) scope multiplied the build time enormously
    // by re-including all of pdfjs-dist for every one of the ~40 other routes.
    "/api/documents": ["./node_modules/@napi-rs/canvas*/**/*", "./node_modules/pdfjs-dist/**/*"],
  },
};

export default nextConfig;
