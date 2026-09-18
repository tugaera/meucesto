import { NextResponse, type NextRequest } from "next/server";
import { getServerEnvironment } from "@/lib/env/server";
import { isTrustedRequestOrigin } from "@/lib/security/origin";
import { createClient } from "@/lib/supabase/server";

const noStoreHeaders = { "Cache-Control": "private, no-store", "Content-Type": "application/json; charset=utf-8" };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const environment = getServerEnvironment();
  if (!isTrustedRequestOrigin(request.headers.get("origin"), environment.NEXT_PUBLIC_SITE_URL)) return NextResponse.json({ errorCode: "NOT_AUTHORIZED" }, { status: 403, headers: noStoreHeaders });
  const formData = await request.formData();
  const password = formData.get("currentPassword");
  if (typeof password !== "string" || !password) return NextResponse.json({ errorCode: "VALIDATION_ERROR" }, { status: 400, headers: noStoreHeaders });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ errorCode: "NOT_AUTHENTICATED" }, { status: 401, headers: noStoreHeaders });
  const reauthenticated = await supabase.auth.signInWithPassword({ email: user.email, password });
  if (reauthenticated.error || reauthenticated.data.user?.id !== user.id) return NextResponse.json({ errorCode: "CURRENT_PASSWORD_INVALID" }, { status: 401, headers: noStoreHeaders });
  const exported = await supabase.rpc("get_my_data_export");
  if (exported.error) return NextResponse.json({ errorCode: "UNKNOWN" }, { status: 500, headers: noStoreHeaders });
  return new NextResponse(JSON.stringify(exported.data, null, 2), {
    status: 200,
    headers: { ...noStoreHeaders, "Content-Disposition": "attachment; filename=meu-cesto-export.json", "X-Content-Type-Options": "nosniff" },
  });
}
