import { generationError } from "@meals/lib/ai/generation-error";
import { normalizeEmail } from "@meals/lib/utils";

export function authorizeGenerationRequest(input: {
  user: { id: string; email: string } | null;
  allowedEmails: string[];
}) {
  if (!input.user) throw generationError("unauthenticated");
  const email = normalizeEmail(input.user.email);
  const allowed = input.allowedEmails.map(normalizeEmail);
  if (!allowed.includes(email)) {
    throw generationError("unauthorized");
  }
  return input.user;
}
