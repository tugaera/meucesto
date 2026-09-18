import { ProductsWorkspace } from "@/features/products/products-workspace";
import { loadProducts } from "@/features/products/data";
import { requireUser } from "@/lib/auth/guards";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; product?: string }> }) {
  const [{ profile }, params] = await Promise.all([requireUser(), searchParams]);
  const query = params.q?.trim().slice(0, 200) ?? "";
  const selectedId = params.product;
  const elevated = profile.role !== "user";
  let data;
  try {
    data = await loadProducts(query, selectedId, elevated);
  } catch (error) {
    console.error("Products page failed to load", { errorCode: error instanceof Error ? error.message : "UNKNOWN" });
    throw error;
  }
  return <ProductsWorkspace data={data} query={query} elevated={elevated} isAdmin={profile.role === "admin"} />;
}
