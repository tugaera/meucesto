import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnvironment } from "@/lib/env/public";
import type { Database } from "@/types/database";

const publicPaths = ["/auth", "/privacy", "/changelog", "/offline"];

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const environment = getPublicEnvironment();
  const supabase = createServerClient<Database>(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = publicPaths.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

  if (!user && !isPublic && path !== "/") {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }
  if (user && (path === "/auth/login" || path === "/auth/signup")) {
    const shoppingUrl = request.nextUrl.clone();
    shoppingUrl.pathname = "/shopping";
    shoppingUrl.search = "";
    return NextResponse.redirect(shoppingUrl);
  }
  return response;
}
