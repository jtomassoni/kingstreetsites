import { AdminLoginForm } from "@/components/admin-login-form";

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <section className="w-full max-w-md">
        <h1 className="mb-3 text-3xl font-semibold text-white">Admin Login</h1>
        <p className="mb-6 text-slate-300">Sign in to access the internal lead dashboard.</p>
        <AdminLoginForm />
      </section>
    </main>
  );
}
