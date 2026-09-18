import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://invalid.supabase.co").origin;
  } catch {
    return "https://invalid.supabase.co";
  }
})();

const contentSecurityPolicy = [
  "default-src 'self'",
  `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace("https://", "wss://")} https://world.openfoodfacts.org https://*.vercel-insights.com`,
  `img-src 'self' data: blob: ${supabaseOrigin}`,
  "media-src 'self' blob:",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  cacheOnNavigation: false,
  reloadOnOnline: false,
  additionalPrecacheEntries: [
    { url: "/offline", revision: "v1" },
    { url: "/icon-192.png", revision: "v1" },
    { url: "/icon-512.png", revision: "v1" },
  ],
});

export default withSerwist(nextConfig);
