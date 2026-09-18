import { ProductsWorkspace } from "@/features/products/products-workspace";
import { loadProducts } from "@/features/products/data";
import { requireUser } from "@/lib/auth/guards";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; product?: string }> }) {
  const [{ profile }, params] = await Promise.all([requireUser(), searchParams]);
  const query = params.q?.trim().slice(0, 200) ?? "";
  const selectedId = params.product;
  const elevated = profile.role !== "user";
  const data = await loadProducts(query, selectedId, elevated);
  return <ProductsWorkspace data={data} query={query} elevated={elevated} isAdmin={profile.role === "admin"} />;
}
