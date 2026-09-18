import { NextResponse, type NextRequest } from "next/server";
import { productSummariesSchema } from "@/types/domain";
import { normalizeBarcode } from "@/lib/barcode/normalize";
import { lookupOpenFoodFacts } from "@/lib/barcode/open-food-facts";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ barcode: string }> }): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ errorCode: "NOT_AUTHENTICATED" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const barcode = normalizeBarcode((await params).barcode);
  if (!barcode) return NextResponse.json({ errorCode: "VALIDATION_ERROR" }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  const local = await supabase.rpc("search_products", { barcode, page_size: 1 });
  const parsed = productSummariesSchema.safeParse(local.data);
  if (!local.error && parsed.success && parsed.data[0]) return NextResponse.json({ source: "local", product: parsed.data[0] }, { headers: { "Cache-Control": "private, no-store" } });
  const suggestion = await lookupOpenFoodFacts(barcode);
  return NextResponse.json(suggestion ? { source: "open-food-facts", product: suggestion } : { source: "none", product: null }, { headers: { "Cache-Control": "private, no-store" } });
}
