"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setMemberWorkingDay } from "@meals/actions/plans";
import type { PlanDay } from "@meals/types/database";
import { cn } from "@meals/lib/utils";

type MemberOption = {
  id: string;
  name: string;
};

/** Compact work-day toggles for calendar column headers. */
export function DayProfileForm({
  day,
  weeklyPlanId,
  members,
}: {
  day: PlanDay;
  weeklyPlanId: string;
  members: MemberOption[];
}) {
  const [pending, start] = useTransition();
  const workingIds = new Set(day.working_user_ids ?? []);

  return (
    <div className="flex flex-col gap-1">
      {members.map((member) => {
        const working = workingIds.has(member.id);
        const short =
          member.name.split(" ")[0] || member.name.slice(0, 6) || "Who";
        return (
          <label
            key={member.id}
            className={cn(
              "flex min-h-7 cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 text-[10px] leading-none transition-colors",
              working
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/60",
            )}
            title={`${member.name} at work`}
          >
            <input
              type="checkbox"
              className="size-3.5 shrink-0 accent-primary"
              checked={working}
              disabled={pending}
              onChange={(e) => {
                const next = e.target.checked;
                start(async () => {
                  const r = await setMemberWorkingDay({
                    planDayId: day.id,
                    weeklyPlanId,
                    userId: member.id,
                    working: next,
                  });
                  if (r.error) toast.error(r.error);
                });
              }}
            />
            <span className="truncate font-medium">{short}</span>
          </label>
        );
      })}
    </div>
  );
}
