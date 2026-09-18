import { AuthShell } from "@/features/auth/auth-shell";
import { ResetPasswordForm } from "@/features/auth/recovery-forms";

export default function ResetPasswordPage() {
  return <AuthShell titleKey="auth.resetTitle" introKey="auth.forgotIntro"><ResetPasswordForm /></AuthShell>;
}
