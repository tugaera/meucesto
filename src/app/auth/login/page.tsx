import { AuthShell } from "@/features/auth/auth-shell";
import { LoginForm } from "@/features/auth/login-form";

export default function LoginPage() {
  return <AuthShell titleKey="auth.welcome" introKey="auth.loginIntro"><LoginForm /></AuthShell>;
}
