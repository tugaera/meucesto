import { ProfileWorkspace } from "@/features/profile/profile-workspace";
import { requireUser } from "@/lib/auth/guards";

export default async function ProfilePage() {
  const { profile } = await requireUser();
  return <ProfileWorkspace key={`${profile.language}:${profile.timezone}`} profile={profile} />;
}
