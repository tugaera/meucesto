import { z } from "zod";
import { JoinPanel } from "@/features/sharing/join-panel";
import { createClient } from "@/lib/supabase/server";

const previewSchema = z.object({ valid: z.boolean(), ownerEmail: z.string().optional(), resourceName: z.string().optional() });

export default async function ListJoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const safeToken = /^[A-Za-z0-9_-]{40,100}$/.test(token) ? token : "";
  const result = safeToken ? await (await createClient()).rpc("preview_list_join_token", { token: safeToken }) : { data: null, error: null };
  const preview = previewSchema.safeParse(result.data);
  return <JoinPanel type="list" token={safeToken} valid={!result.error && preview.success && preview.data.valid} ownerEmail={preview.success ? preview.data.ownerEmail : undefined} resourceName={preview.success ? preview.data.resourceName : undefined} />;
}
