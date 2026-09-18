import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth/guards";

export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { profile } = await requireUser();
  return <AppShell profile={profile}>{children}</AppShell>;
}
