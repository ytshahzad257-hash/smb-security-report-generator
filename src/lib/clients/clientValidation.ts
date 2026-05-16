import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null));

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : null))
  .refine((value) => !value || value.startsWith("http://") || value.startsWith("https://"), {
    message: "Website must start with http:// or https://.",
  })
  .refine((value) => {
    if (!value) {
      return true;
    }

    try {
      const url = new URL(value);

      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "Enter a valid website URL.");

export const clientInputSchema = z.object({
  companyName: optionalText(120),
  contactEmail: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null))
    .refine((value) => !value || z.email().safeParse(value).success, {
      message: "Enter a valid email address.",
    }),
  name: z
    .string()
    .trim()
    .min(2, "Client name must be at least 2 characters.")
    .max(80, "Client name must be 80 characters or fewer."),
  notes: optionalText(1000),
  phone: optionalText(40),
  website: optionalUrl,
});

export type ClientInput = z.infer<typeof clientInputSchema>;

export function validateClientInput(input: unknown) {
  return clientInputSchema.safeParse(input);
}
