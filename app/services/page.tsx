import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { servicePillars } from "@/lib/data";

export default function ServicesPage() {
  return (
    <SiteShell>
      <section className="section">
        <h1 className="text-4xl font-semibold text-white">Services</h1>
        <p className="mt-3 max-w-3xl text-slate-300">
          We build premium websites for local businesses that need stronger conversion, trust, and mobile usability without replacing the tools they already rely on.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {servicePillars.map((pillar) => (
            <div key={pillar} className="rounded-xl border border-white/10 bg-slate-900/60 p-5 text-slate-200">
              {pillar}
            </div>
          ))}
        </div>
        <div className="mt-10 rounded-2xl border border-white/10 bg-slate-900/50 p-6">
          <h2 className="text-2xl font-semibold text-white">Built for your industry</h2>
          <p className="mt-3 text-slate-300">
            Restaurant websites focused on direct orders and bookings. Law firm websites focused on consultations and trust. Contractor websites focused on quote requests and calls.
          </p>
          <p className="mt-3 text-slate-300">Custom functionality can be layered in later based on your business needs.</p>
          <Link href="/contact" className="mt-5 inline-block rounded-full bg-brand px-6 py-3 font-semibold text-white">
            Request a Free Site Audit
          </Link>
        </div>
      </section>
    </SiteShell>
  );
}
