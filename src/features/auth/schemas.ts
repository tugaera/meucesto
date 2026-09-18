import { z } from "zod";

export const loginSchema = z.object({
  email: z.email().max(320).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(10).max(200),
});

export const signupSchema = loginSchema.extend({
  inviteCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{8}$/),
  confirmPassword: z.string().min(10).max(200),
}).refine((value) => value.password === value.confirmPassword, {
  path: ["confirmPassword"],
  message: "PASSWORD_MISMATCH",
});

export const emailSchema = z.object({
  email: z.email().max(320).transform((value) => value.trim().toLowerCase()),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(10).max(200),
  confirmPassword: z.string().min(10).max(200),
}).refine((value) => value.password === value.confirmPassword, {
  path: ["confirmPassword"],
  message: "PASSWORD_MISMATCH",
});
