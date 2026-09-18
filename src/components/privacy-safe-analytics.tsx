"use client";

import { Analytics, type BeforeSendEvent as AnalyticsEvent } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

function pathOnly(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split(/[?#]/, 1)[0] ?? url;
  }
}

export function PrivacySafeAnalytics() {
  return <><Analytics beforeSend={(event: AnalyticsEvent) => ({ ...event, url: pathOnly(event.url) })} /><SpeedInsights beforeSend={(event) => {
    const route = event.route?.split(/[?#]/, 1)[0];
    return { ...event, url: pathOnly(event.url), ...(route ? { route } : {}) };
  }} /></>;
}
