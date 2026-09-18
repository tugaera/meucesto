import { notFound } from "next/navigation";
import { z } from "zod";
import { AdminWorkspace } from "@/features/admin/admin-workspace";
import { loadAdminData, type AdminCursor } from "@/features/admin/data";

const tabs = ["users", "stores", "categories", "brands", "units", "audit"] as const;
const cursorSchema = z.object({ createdAt: z.iso.datetime(), id: z.uuid() });

function parseCursor(createdAt: string | undefined, id: string | undefined): AdminCursor | undefined {
  if (!createdAt && !id) return undefined;
  const parsed = cursorSchema.safeParse({ createdAt, id });
  if (!parsed.success) notFound();
  return parsed.data;
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ section?: string; usersAt?: string; usersId?: string; invitesAt?: string; invitesId?: string; auditAt?: string; auditId?: string }> }) {
  const params = await searchParams;
  const parsedTab = z.enum(tabs).safeParse(params.section ?? "users");
  if (!parsedTab.success) notFound();
  const usersCursor = parseCursor(params.usersAt, params.usersId);
  const invitesCursor = parseCursor(params.invitesAt, params.invitesId);
  const auditCursor = parseCursor(params.auditAt, params.auditId);
  const cursors = {
    ...(usersCursor ? { users: usersCursor } : {}),
    ...(invitesCursor ? { invites: invitesCursor } : {}),
    ...(auditCursor ? { audit: auditCursor } : {}),
  };
  let data;
  try {
    data = await loadAdminData(cursors);
  } catch (error) {
    console.error("Admin page failed to load", { errorCode: error instanceof Error ? error.message : "UNKNOWN" });
    throw error;
  }
  return <AdminWorkspace data={data} initialTab={parsedTab.data} cursorState={{ users: Boolean(usersCursor), invites: Boolean(invitesCursor), audit: Boolean(auditCursor) }} />;
}
