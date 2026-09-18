/// <reference lib="webworker" />

import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, type PrecacheEntry } from "serwist";
import { APP_VERSION } from "@/generated/app-version";

declare const self: ServiceWorkerGlobalScope & { __SW_MANIFEST: PrecacheEntry[] };

const isSensitiveRequest = ({ request, url }: { request: Request; url: URL }): boolean => {
  const acceptsRsc = request.headers.get("RSC") === "1" || request.headers.has("Next-Router-State-Tree");
  return request.method !== "GET"
    || request.mode === "navigate"
    || request.destination === "document"
    || acceptsRsc
    || url.hostname.endsWith(".supabase.co")
    || url.pathname.startsWith("/auth/")
    || url.pathname.startsWith("/api/")
    || url.searchParams.has("token")
    || url.searchParams.has("code");
};

const serwist = new Serwist({
  cacheId: `meu-cesto-${APP_VERSION}`,
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      matcher: isSensitiveRequest,
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ request, sameOrigin, url }) => sameOrigin && (
        url.pathname.startsWith("/_next/static/")
        || url.pathname.startsWith("/assets/")
        || request.destination === "style"
        || request.destination === "script"
        || request.destination === "font"
        || request.destination === "manifest"
        || (request.destination === "image" && /^\/icon-(192|512)\.png$/.test(url.pathname))
      ),
      handler: new CacheFirst({
        cacheName: `meu-cesto-static-${APP_VERSION}`,
        plugins: [new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 })],
      }),
    },
  ],
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
