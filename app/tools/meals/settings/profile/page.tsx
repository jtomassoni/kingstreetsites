import { redirect } from "next/navigation";

export default function ProfileSettingsRedirect() {
  redirect("/tools/meals/settings");
}
