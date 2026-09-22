import Image from "next/image";
import type { ReactNode } from "react";
import type { AppProfile } from "@/lib/auth/guards";
import { I18nProvider } from "@/i18n/provider";
import { translate } from "@/i18n";
import { AppNavigation } from "./app-navigation";
import { OfflineSyncManager } from "./offline-sync-manager";
import { PullToRefresh } from "./pull-to-refresh";
import { SignOutButton } from "./sign-out-button";
import { SyncStatus } from "./sync-status";

export function AppShell({ profile, children }: { profile: AppProfile; children: ReactNode }) {
  const showAdmin = profile.role !== "user";
  const roleKey = { admin: "admin.role.admin", moderator: "admin.role.moderator", user: "admin.role.user" } as const;
  return (
    <I18nProvider initialLocale={profile.language}>
      <div className="min-h-screen md:grid md:grid-cols-[var(--sidebar)_1fr]">
        <OfflineSyncManager userId={profile.id} />
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar)] flex-col border-r border-[var(--line)] bg-white md:flex">
          <div className="flex h-[73px] items-center gap-3 border-b border-[var(--line)] px-5"><Image src="/assets/meu-cesto-mark.png" width={42} height={42} alt="" priority /><span className="text-lg font-bold">Meu Cesto</span></div>
          <div className="grid gap-1 py-4"><AppNavigation showAdmin={showAdmin} /></div>
          <div className="mt-auto border-t border-[var(--line)] p-4">
            <div className="mb-3 flex items-center gap-3 overflow-hidden"><span className="flex h-9 w-9 shrink-0 items-center justify-center bg-[#173f34] text-sm font-bold text-white">{profile.email.slice(0, 1).toUpperCase()}</span><div className="min-w-0"><p className="truncate text-xs font-semibold">{profile.email}</p><p className="mt-0.5 text-xs text-[var(--muted)]">{translate(profile.language, roleKey[profile.role])}</p></div></div>
            <SignOutButton />
          </div>
        </aside>
        <div className="min-w-0 md:col-start-2">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[var(--line)] bg-[color:rgba(247,249,248,0.96)] px-4 backdrop-blur md:h-[73px] md:px-7">
            <div className="flex items-center gap-2 font-bold md:hidden"><Image src="/assets/meu-cesto-mark.png" width={36} height={36} alt="" priority />Meu Cesto</div>
            <div className="hidden text-xs font-semibold uppercase text-[var(--muted)] md:block">{profile.timezone}</div>
            <SyncStatus userId={profile.id} />
          </header>
          <PullToRefresh><main className="page-enter mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 md:px-8 md:py-8">{children}</main></PullToRefresh>
        </div>
        <div className={showAdmin ? "fixed inset-x-0 bottom-0 z-40 grid min-h-[58px] grid-cols-6 border-t border-[var(--line)] bg-white pb-[env(safe-area-inset-bottom)] md:hidden" : "fixed inset-x-0 bottom-0 z-40 grid min-h-[58px] grid-cols-5 border-t border-[var(--line)] bg-white pb-[env(safe-area-inset-bottom)] md:hidden"}><AppNavigation showAdmin={showAdmin} /></div>
      </div>
    </I18nProvider>
  );
}
