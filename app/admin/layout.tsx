import { auth, signOut } from "@/auth";
import { Inter } from "next/font/google";
import { redirect } from "next/navigation";
import AdminNav from "./admin-nav";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className={`app-shell min-h-screen ${inter.className}`}>
      <AdminNav email={session.user?.email ?? ""} signOutAction={signOutAction} />
      <main className="mx-auto max-w-[min(100%,92rem)] px-5 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/" });
}
