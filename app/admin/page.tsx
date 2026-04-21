import { redirect } from "next/navigation";

import { isAdminAuthenticated } from "@/lib/auth";
import { getRecentLeads } from "@/lib/leads";

export default async function AdminDashboardPage() {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) redirect("/admin/login");
  const leads = await getRecentLeads(25);
  const newLeads = leads.filter((lead) => lead.status.toLowerCase() === "new").length;
  const awaitingResponse = leads.filter((lead) => lead.status.toLowerCase() !== "closed").length;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <section className="mx-auto w-full max-w-6xl">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-white">Internal CRM Dashboard</h1>
            <p className="mt-2 text-slate-300">Lightweight lead and submission overview for solo operator workflows.</p>
          </div>
          <form action="/api/admin/logout" method="post">
            <button className="rounded-full border border-white/20 px-4 py-2 text-sm text-slate-200">Log out</button>
          </form>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
            <p className="text-sm text-slate-300">Leads</p>
            <p className="mt-1 text-3xl font-semibold text-white">{leads.length}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
            <p className="text-sm text-slate-300">New leads</p>
            <p className="mt-1 text-3xl font-semibold text-white">{newLeads}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
            <p className="text-sm text-slate-300">Awaiting response</p>
            <p className="mt-1 text-3xl font-semibold text-white">{awaitingResponse}</p>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-4 py-3 font-medium text-slate-300">Name</th>
                <th className="px-4 py-3 font-medium text-slate-300">Business</th>
                <th className="px-4 py-3 font-medium text-slate-300">Industry</th>
                <th className="px-4 py-3 font-medium text-slate-300">Status</th>
                <th className="px-4 py-3 font-medium text-slate-300">Source</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-t border-white/10">
                  <td className="px-4 py-3 text-slate-100">{lead.name}</td>
                  <td className="px-4 py-3 text-slate-200">{lead.businessName}</td>
                  <td className="px-4 py-3 text-slate-200">{lead.industry}</td>
                  <td className="px-4 py-3 text-slate-200">{lead.status}</td>
                  <td className="px-4 py-3 text-slate-200">{lead.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
