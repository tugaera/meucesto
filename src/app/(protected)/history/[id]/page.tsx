import { notFound } from "next/navigation";
import { loadHistoryDetail } from "@/features/history/data";
import { HistoryDetail } from "@/features/history/history-detail";
import { hasAiProvider } from "@/lib/env/server";

export const maxDuration = 120;

export default async function HistoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data;
  try {
    data = await loadHistoryDetail(id);
  } catch (error) {
    if (error instanceof Error && ["NOT_AUTHORIZED", "RESOURCE_NOT_FOUND"].includes(error.message)) notFound();
    throw error;
  }
  return <HistoryDetail data={data} aiEnabled={hasAiProvider()} />;
}
