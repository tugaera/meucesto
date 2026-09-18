"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import { realtimeInvalidationSchema } from "./schemas";

export function RealtimeController({ resourceType, resourceId, revision }: { resourceType: "cart" | "list"; resourceId: string; revision: number }) {
  const router = useRouter();
  const { t } = useT();
  const seen = useRef(new Set<string>());
  const latestRevision = useRef(revision);
  const [degraded, setDegraded] = useState(false);
  useEffect(() => { latestRevision.current = revision; }, [revision]);
  useEffect(() => {
    const supabase = createClient();
    const topic = `${resourceType}-sync-${resourceId}`;
    const channel = supabase.channel(topic, { config: { private: true, broadcast: { self: false } } });
    channel.on("broadcast", { event: "invalidate" }, ({ payload }) => {
      const parsed = realtimeInvalidationSchema.safeParse(payload);
      if (!parsed.success || parsed.data.resource_id !== resourceId || seen.current.has(parsed.data.event_id)) return;
      seen.current.add(parsed.data.event_id);
      if (seen.current.size > 200) seen.current.delete(seen.current.values().next().value ?? "");
      if (parsed.data.revision > latestRevision.current) router.refresh();
    }).subscribe((status) => {
      if (status === "SUBSCRIBED") { setDegraded(false); router.refresh(); }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setDegraded(true);
    });
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh); void supabase.removeChannel(channel); };
  }, [resourceId, resourceType, router]);
  return <span className="screen-reader-only" role="status" aria-live="polite">{degraded ? t("sync.degraded") : ""}</span>;
}
