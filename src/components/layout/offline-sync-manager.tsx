"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { setCurrentOfflineUser } from "@/lib/offline/db";
import { processOfflineQueue } from "@/lib/offline/queue";

export function OfflineSyncManager({ userId }: { userId: string }) {
  const router = useRouter();
  useEffect(() => {
    let active = true;
    const sync = async () => {
      await setCurrentOfflineUser(userId);
      const changed = await processOfflineQueue(userId);
      if (active && changed) router.refresh();
    };
    const onFocus = () => { if (document.visibilityState === "visible") void sync(); };
    void sync();
    const interval = window.setInterval(() => void sync(), 10_000);
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [router, userId]);
  return null;
}
