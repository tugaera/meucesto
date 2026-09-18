import { AuthShell } from "@/features/auth/auth-shell";
import { SignupForm } from "@/features/auth/signup-form";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code = "" } = await searchParams;
  const safeCode = /^[A-Za-z0-9]{0,8}$/.test(code) ? code.toUpperCase() : "";
  return <AuthShell titleKey="auth.signupTitle" introKey="auth.signupIntro"><SignupForm initialCode={safeCode} /></AuthShell>;
}
