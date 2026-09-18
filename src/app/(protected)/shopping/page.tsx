import { notFound } from "next/navigation";
import { ShoppingWorkspace } from "@/features/shopping/shopping-workspace";
import { loadShoppingData } from "@/features/shopping/data";

export default async function ShoppingPage({ searchParams }: { searchParams: Promise<{ cart?: string; list?: string }> }) {
  const { cart, list } = await searchParams;
  let data;
  try {
    data = await loadShoppingData(cart, list);
  } catch (error) {
    if ((cart || list) && error instanceof Error && ["NOT_AUTHORIZED", "RESOURCE_NOT_FOUND"].includes(error.message)) notFound();
    console.error("Shopping page failed to load", { errorCode: error instanceof Error ? error.message : "UNKNOWN" });
    throw error;
  }
  return <ShoppingWorkspace data={data} />;
}
