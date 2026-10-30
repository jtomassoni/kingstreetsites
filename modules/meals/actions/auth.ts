"use server";

import {
  toolsEasyLoginAction,
  toolsLoginAction,
  toolsLogoutAction,
  type ToolsAuthActionResult,
} from "@/lib/tools/auth/actions";

export type AuthActionResult = ToolsAuthActionResult;

export async function loginAction(
  prev: AuthActionResult,
  formData: FormData,
): Promise<AuthActionResult> {
  return toolsLoginAction(prev, formData);
}

export async function envUserLoginAction(
  prev: AuthActionResult,
  formData: FormData,
): Promise<AuthActionResult> {
  return toolsEasyLoginAction(prev, formData);
}

export async function logoutAction() {
  return toolsLogoutAction();
}
