import { redirect } from "next/navigation";
import { formatWeekStart, getWeekStart } from "@meals/lib/week/dates";

export default function WeekIndexPage() {
  redirect(`/tools/meals/week/${formatWeekStart(getWeekStart(new Date()))}`);
}
