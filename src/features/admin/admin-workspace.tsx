"use client";

import { Activity, Building2, FolderTree, Ruler, Tags, Users } from "lucide-react";
import { useState, type ComponentType } from "react";
import { PageHeading, Surface } from "@/components/ui/surface";
import { useT } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { AuditPanel } from "./audit-panel";
import { BrandsPanel, CategoriesPanel, StoresPanel, UnitsPanel } from "./catalog-panels";
import type { AdminData } from "./data";
import { InvitePanel } from "./invite-panel";
import { UsersPanel } from "./users-panel";

export type AdminTab = "users" | "stores" | "categories" | "brands" | "units" | "audit";

interface TabItem { id: AdminTab; label: "admin.users" | "admin.stores" | "admin.categories" | "admin.brands" | "admin.units" | "admin.audit"; icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }> }

const baseTabs: TabItem[] = [
  { id: "users", label: "admin.users", icon: Users },
  { id: "stores", label: "admin.stores", icon: Building2 },
  { id: "categories", label: "admin.categories", icon: FolderTree },
  { id: "brands", label: "admin.brands", icon: Tags },
  { id: "units", label: "admin.units", icon: Ruler },
];

export function AdminWorkspace({ data, initialTab, cursorState }: { data: AdminData; initialTab: AdminTab; cursorState: { users: boolean; invites: boolean; audit: boolean } }) {
  const { t } = useT();
  const isAdmin = data.profile.role === "admin";
  const [tab, setTab] = useState<AdminTab>(initialTab === "audit" && !isAdmin ? "users" : initialTab);
  const tabs = isAdmin ? [...baseTabs, { id: "audit" as const, label: "admin.audit" as const, icon: Activity }] : baseTabs;
  const usersKey = data.users.map((user) => `${user.id}:${user.role}`).join("|");
  const invitesKey = data.invites.map((invite) => `${invite.id}:${invite.usedAt ?? ""}:${invite.revokedAt ?? ""}`).join("|");
  const referencesKey = [
    ...data.references.stores.map((item) => `${item.id}:${item.name}:${item.isActive}:${item.sortOrder ?? ""}`),
    ...data.references.categories.map((item) => `${item.id}:${item.name}:${item.parentId ?? ""}:${item.isActive}:${item.sortOrder ?? ""}`),
    ...data.references.brands.map((item) => `${item.id}:${item.name}:${item.isActive}:${item.isVerified}`),
    ...data.references.units.map((item) => `${item.id}:${item.name}:${item.abbreviation}:${item.isActive}:${item.isDefault}`),
  ].join("|");
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <PageHeading title={t("admin.title")} description={t("admin.subtitle")} />
      <div role="tablist" aria-label={t("admin.title")} className="flex overflow-x-auto border-b border-[var(--line)] bg-white">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn("flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-semibold", tab === id ? "border-[var(--emerald)] text-[var(--emerald-dark)]" : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]")}><Icon className="h-4 w-4" aria-hidden />{t(label)}</button>)}
      </div>
      <Surface className="p-4 sm:p-6">
        <div role="tabpanel">
          {tab === "users" ? <div className="grid gap-8"><section aria-labelledby="users-heading"><h2 id="users-heading" className="mb-4 text-lg font-bold">{t("admin.users")}</h2><UsersPanel key={usersKey} users={data.users} isAdmin={isAdmin} nextCursor={data.nextUsersCursor} cursorActive={cursorState.users} /></section><section className="border-t border-[var(--line)] pt-6"><InvitePanel key={invitesKey} invites={data.invites} role={data.profile.role} nextCursor={data.nextInvitesCursor} cursorActive={cursorState.invites} /></section></div> : null}
          {tab === "stores" ? <StoresPanel key={`stores:${referencesKey}`} references={data.references} /> : null}
          {tab === "categories" ? <CategoriesPanel key={`categories:${referencesKey}`} references={data.references} isAdmin={isAdmin} /> : null}
          {tab === "brands" ? <BrandsPanel key={`brands:${referencesKey}`} references={data.references} isAdmin={isAdmin} /> : null}
          {tab === "units" ? <UnitsPanel key={`units:${referencesKey}`} references={data.references} isAdmin={isAdmin} /> : null}
          {tab === "audit" && isAdmin ? <AuditPanel events={data.audit} nextCursor={data.nextAuditCursor} cursorActive={cursorState.audit} /> : null}
        </div>
      </Surface>
    </div>
  );
}
