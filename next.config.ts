import type { NextConfig } from "next";
import { IMAGE_HOSTS } from "./src/lib/comparer/types";

// What pages may load. Next.js puts small inline scripts and styles in every page, so those stay
// allowed; everything else is limited to this site, the weather API the browser calls, and the
// shops' image hosts. Only in production: the dev server needs eval and a websocket.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${IMAGE_HOSTS.flatMap((h) => [`https://${h}`, `https://*.${h}`]).join(" ")}`,
  "font-src 'self'",
  "connect-src 'self' https://api.open-meteo.com https://air-quality-api.open-meteo.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
const production = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // A self-contained server in .next/standalone, used by the Docker image.
  output: "standalone",
  // Don't advertise the framework in every response.
  poweredByHeader: false,
  partialPrefetching: true,
  // Loaded at runtime from node_modules instead of being bundled.
  serverExternalPackages: ["playwright-core"],
  // playwright-core loads some of its own files by name, which the build can't trace.
  outputFileTracingIncludes: {
    "/api/comparer": ["./node_modules/playwright-core/**/*"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: production ? csp : "frame-ancestors 'none'" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // Browsers only honour this over HTTPS; it makes them refuse plain HTTP for a year.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/app/comparer", destination: "/apps/comparer", permanent: true },
      { source: "/apps/bike", destination: "/apps/outside", permanent: true },
      { source: "/projects", destination: "/apps", permanent: true },
    ];
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
