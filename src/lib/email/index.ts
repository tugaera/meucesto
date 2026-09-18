import "server-only";

import nodemailer from "nodemailer";
import type { ServerEnvironment } from "@/lib/env/server";

export interface InvitationEmail {
  recipient: string;
  code: string;
  signupUrl: string;
  inviteId: string;
}

export type EmailResult = { success: true; providerMessageId: string } | { success: false; errorCode: "EMAIL_UNAVAILABLE" | "EMAIL_DELIVERY_FAILED" };

function invitationBody(invitation: InvitationEmail): { subject: string; text: string; html: string } {
  const subject = "Convite para o Meu Cesto";
  const text = `Recebeste um convite para o Meu Cesto. Código: ${invitation.code}\nCriar conta: ${invitation.signupUrl}`;
  const html = `<p>Recebeste um convite para o <strong>Meu Cesto</strong>.</p><p>Código: <strong>${invitation.code}</strong></p><p><a href="${invitation.signupUrl}">Criar conta</a></p>`;
  return { subject, text, html };
}

async function sendWithResend(invitation: InvitationEmail, environment: ServerEnvironment): Promise<EmailResult> {
  const body = invitationBody(invitation);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${environment.EMAIL_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": invitation.inviteId },
      body: JSON.stringify({ from: environment.EMAIL_FROM, to: [invitation.recipient], ...body }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok) return { success: false, errorCode: "EMAIL_DELIVERY_FAILED" };
    const payload: unknown = await response.json();
    const id = typeof payload === "object" && payload !== null && "id" in payload && typeof payload.id === "string" ? payload.id : invitation.inviteId;
    return { success: true, providerMessageId: id };
  } catch {
    return { success: false, errorCode: "EMAIL_DELIVERY_FAILED" };
  }
}

async function sendWithSmtp(invitation: InvitationEmail, environment: ServerEnvironment): Promise<EmailResult> {
  if (!environment.EMAIL_SMTP_HOST || !environment.EMAIL_SMTP_USER || !environment.EMAIL_SMTP_PASSWORD) return { success: false, errorCode: "EMAIL_UNAVAILABLE" };
  const transporter = nodemailer.createTransport({
    host: environment.EMAIL_SMTP_HOST,
    port: environment.EMAIL_SMTP_PORT,
    secure: environment.EMAIL_SMTP_SECURE,
    auth: { user: environment.EMAIL_SMTP_USER, pass: environment.EMAIL_SMTP_PASSWORD },
    connectionTimeout: 10_000,
  });
  try {
    const result = await transporter.sendMail({ from: environment.EMAIL_FROM, to: invitation.recipient, ...invitationBody(invitation), headers: { "X-Entity-Ref-ID": invitation.inviteId } });
    return { success: true, providerMessageId: result.messageId };
  } catch {
    return { success: false, errorCode: "EMAIL_DELIVERY_FAILED" };
  } finally {
    transporter.close();
  }
}

export async function sendInvitationEmail(invitation: InvitationEmail, environment: ServerEnvironment): Promise<EmailResult> {
  if (environment.EMAIL_PROVIDER === "disabled") return { success: false, errorCode: "EMAIL_UNAVAILABLE" };
  if (environment.EMAIL_PROVIDER === "resend") return sendWithResend(invitation, environment);
  return sendWithSmtp(invitation, environment);
}
