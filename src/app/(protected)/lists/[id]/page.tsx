import { notFound } from "next/navigation";
import { z } from "zod";
import { loadList } from "@/features/lists/data";
import { ListWorkspace } from "@/features/lists/list-workspace";

export default async function ListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  let data;
  try {
    data = await loadList(id);
  } catch (error) {
    if (error instanceof Error && ["NOT_AUTHORIZED", "RESOURCE_NOT_FOUND"].includes(error.message)) notFound();
    throw error;
  }
  return <ListWorkspace {...data} />;
}
