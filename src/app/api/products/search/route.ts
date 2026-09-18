import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { toErrorCode } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { productSummariesSchema } from "@/types/domain";

const querySchema = z.object({
  q: z.string().trim().max(200).default(""),
  cursorName: z.string().min(1).max(200),
  cursorId: z.uuid(),
});

const PAGE_SIZE = 20;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const parsed = querySchema.safeParse({
    q: request.nextUrl.searchParams.get("q") ?? "",
    cursorName: request.nextUrl.searchParams.get("cursorName"),
    cursorId: request.nextUrl.searchParams.get("cursorId"),
  });
  if (!parsed.success) return NextResponse.json({ errorCode: "VALIDATION_ERROR" }, { status: 400 });

  const { profile } = await requireUser();
  const { data, error } = await (await createClient()).rpc("search_products", {
    ...(parsed.data.q ? { search_text: parsed.data.q } : {}),
    cursor_name: parsed.data.cursorName,
    cursor_id: parsed.data.cursorId,
    page_size: PAGE_SIZE + 1,
    include_inactive: profile.role !== "user",
  });
  if (error) return NextResponse.json({ errorCode: toErrorCode(error) }, { status: 400 });
  const page = productSummariesSchema.safeParse(data);
  if (!page.success) return NextResponse.json({ errorCode: "INVALID_SERVER_RESPONSE" }, { status: 502 });

  const products = page.data.slice(0, PAGE_SIZE);
  const last = products.at(-1);
  const nextCursor = page.data.length > PAGE_SIZE && last
    ? { name: last.name.trim().toLocaleLowerCase().replace(/\s+/gu, " "), id: last.id }
    : null;
  return NextResponse.json({ products, nextCursor }, { headers: { "Cache-Control": "private, no-store" } });
}
