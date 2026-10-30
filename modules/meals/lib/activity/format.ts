import { format, parseISO } from "date-fns";

export function formatActivityWhen(iso: string) {
  const date = parseISO(iso);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) return format(date, "h:mm a");
  return format(date, "MMM d, h:mm a");
}
