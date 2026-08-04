"use server";
import { signIn } from "@/auth";

export async function devSignIn() {
  await signIn("dev", { redirectTo: "/admin/leads" });
}
