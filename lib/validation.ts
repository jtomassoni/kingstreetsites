import { z } from "zod";

export const contactSchema = z.object({
  name: z.string().min(2, "Please enter your name."),
  businessName: z.string().min(2, "Please enter your business name."),
  email: z.string().email("Please enter a valid email."),
  website: z.string().optional(),
  industry: z.enum(["Restaurant", "Law Firm", "Contractor", "Other"]),
  message: z.string().min(10, "Please share a few details about your goals.")
});

export type ContactInput = z.infer<typeof contactSchema>;
