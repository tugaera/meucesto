import { notFound } from "next/navigation";
import { z } from "zod";
import { loadHistoryPage } from "@/features/history/data";
import { HistoryWorkspace } from "@/features/history/history-workspace";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ cursorAt?: string; cursorId?: string }> }) {
  const params = await searchParams;
  const cursorSchema = z.object({ finalizedAt: z.iso.datetime(), id: z.uuid() });
  const parsed = params.cursorAt && params.cursorId ? cursorSchema.safeParse({ finalizedAt: params.cursorAt, id: params.cursorId }) : null;
  if (parsed && !parsed.success) notFound();
  const data = await loadHistoryPage(parsed?.success ? parsed.data : undefined);
  return <HistoryWorkspace data={data} />;
}
