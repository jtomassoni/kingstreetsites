"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "./toast";

export default function AdminProviders({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
