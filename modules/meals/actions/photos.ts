"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@meals/lib/auth/session";

const NOT_CONFIGURED = "Photo upload is not configured";

export async function uploadMealPhoto(_formData?: FormData) {
  void _formData;
  await requireHouseholdContext();
  return { error: NOT_CONFIGURED };
}

export async function getSignedPhotoUrl(_storagePath?: string) {
  void _storagePath;
  await requireHouseholdContext();
  return { error: NOT_CONFIGURED };
}

export async function deleteMealPhoto(_photoId?: string) {
  void _photoId;
  await requireHouseholdContext();
  revalidatePath("/tools/meals/history");
  return { error: NOT_CONFIGURED };
}
