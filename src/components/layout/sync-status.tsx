"use client";

import { AlertCircle, Cloud, CloudOff, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/provider";
import { subscribeToQueueState } from "@/lib/offline/queue";
import type { OfflineMutation } from "@/lib/offline/types";

export function SyncStatus({ userId }: { userId: string }) {
  const { t } = useT();
  const [online, setOnline] = useState(true);
  const [mutations, setMutations] = useState<OfflineMutation[]>([]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  useEffect(() => subscribeToQueueState(userId, setMutations), [userId]);
  const failed = mutations.some((mutation) => mutation.status === "failed");
  const syncing = mutations.some((mutation) => mutation.status === "syncing");
  const pending = mutations.some((mutation) => mutation.status === "pending");
  const label = !online ? t("sync.offline") : failed ? t("sync.failed") : syncing ? t("sync.syncing") : pending ? t("sync.pending") : t("sync.current");
  const icon = !online
    ? <CloudOff className="h-4 w-4 text-[var(--coral)]" aria-hidden />
    : failed
      ? <AlertCircle className="h-4 w-4 text-[var(--danger)]" aria-hidden />
      : syncing || pending
        ? <RefreshCw className="h-4 w-4 text-[var(--amber)]" aria-hidden />
        : <Cloud className="h-4 w-4 text-[var(--emerald)]" aria-hidden />;
  return <div role="status" aria-live="polite" className="flex min-h-9 items-center gap-2 border border-[var(--line)] bg-white px-3 text-xs font-semibold text-[var(--muted)]">{icon}<span>{label}</span></div>;
}
