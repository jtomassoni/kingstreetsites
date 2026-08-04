import { redirect } from "next/navigation";

export default function CustomersRedirect() {
  redirect("/admin/leads?view=customers");
}
