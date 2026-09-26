import { z } from "zod";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email is too long")
  .pipe(z.email("Enter a valid email address"));

const password = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters`);

export const signUpSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name").max(80, "Name is too long"),
    email,
    password,
  })
  .strict();

export const signInSchema = z
  .object({
    email,
    password: z.string().min(1, "Enter your password").max(PASSWORD_MAX),
  })
  .strict();

export const demoRoleSchema = z.enum(["instructor", "ta", "student"]);

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type DemoRole = z.infer<typeof demoRoleSchema>;

/**
 * Only allow same-site relative paths after sign-in (prevents open redirects such as
 * `?next=//evil.example` or `?next=https://evil.example`).
 */
export function safeRedirectPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(value)) return fallback;
  return value;
}
