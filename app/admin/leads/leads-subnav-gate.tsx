"use client";

import { usePathname } from "next/navigation";
import { LeadsSubNav } from "./leads-subnav";

export function LeadsSubNavGate({
  counts,
}: {
  counts?: { leads: number; customers: number };
}) {
  const pathname = usePathname();
  const isDetail = /^\/admin\/leads\/(?!pipeline$)[^/]+/.test(pathname);
  if (isDetail) return null;
  return <LeadsSubNav counts={counts} />;
}
