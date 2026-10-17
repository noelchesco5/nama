import { z } from "zod";

export const LOCALES = ["en", "sw"] as const;
export type Locale = (typeof LOCALES)[number];

export const localeSchema = z.enum(LOCALES).default("en");

export const emailSchema = z
  .email({ error: "Enter a valid email address." })
  .trim()
  .toLowerCase()
  .max(254);

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use at most 72 characters.");

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+255\d{9}$/, "Enter a Tanzanian number starting with +255.");

export const displayNameSchema = z.string().trim().min(2, "Enter your full name.").max(80);

export const INTENDED_ROLES = ["client", "specialist"] as const;
export const intendedRoleSchema = z.enum(INTENDED_ROLES);

export const signUpSchema = z.object({
  fullName: displayNameSchema,
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  intendedRole: intendedRoleSchema,
  locale: localeSchema,
  acceptedTerms: z.literal(true, { error: "Please accept the Terms and Privacy Policy." }),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(72),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const tzsStringSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, "Enter a whole number of shillings.");

export function tzsAmountSchema(min: bigint, max: bigint) {
  return z
    .string()
    .trim()
    .regex(/^\d+$/, "Enter a whole number of shillings.")
    .refine((value) => !/^\d+$/.test(value) || BigInt(value) >= min, `Minimum is ${min} shillings.`)
    .refine((value) => !/^\d+$/.test(value) || BigInt(value) <= max, `Maximum is ${max} shillings.`);
}
