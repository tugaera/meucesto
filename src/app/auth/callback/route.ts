import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { z } from "zod";
import { safeAuthDestination } from "@/lib/auth/redirects";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const destination = safeAuthDestination(request.nextUrl.searchParams.get("next"));
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const otpType = z.enum(["signup", "invite", "magiclink", "recovery", "email_change", "email"]).safeParse(request.nextUrl.searchParams.get("type"));
  const responseUrl = request.nextUrl.clone();
  responseUrl.search = "";

  if (!code && (!tokenHash || !otpType.success)) {
    responseUrl.pathname = "/auth/login";
    responseUrl.searchParams.set("error", "CALLBACK_INVALID");
    return NextResponse.redirect(responseUrl);
  }

  const supabase = await createClient();
  let error: Error | null;
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && otpType.success) {
    ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType.data as EmailOtpType }));
  } else {
    error = new Error("CALLBACK_INVALID");
  }
  if (error) {
    responseUrl.pathname = "/auth/login";
    responseUrl.searchParams.set("error", "CALLBACK_INVALID");
    return NextResponse.redirect(responseUrl);
  }
  responseUrl.pathname = destination;
  return NextResponse.redirect(responseUrl);
}
