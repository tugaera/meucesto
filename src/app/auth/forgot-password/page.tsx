import { AuthShell } from "@/features/auth/auth-shell";
import { ForgotPasswordForm } from "@/features/auth/recovery-forms";

export default function ForgotPasswordPage() {
  return (
    <AuthShell titleKey="auth.forgotTitle" introKey="auth.forgotIntro" backHref="/auth/login">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
