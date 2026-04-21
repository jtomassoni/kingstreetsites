import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { demoProjects } from "@/lib/data";

export default function HomePage() {
  return (
    <SiteShell>
      <section className="section grid gap-8 pt-20 md:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-300">King Street Sites</p>
          <h1 className="text-4xl font-semibold leading-tight text-white md:text-6xl">Websites that turn visitors into customers</h1>
          <p className="max-w-xl text-lg text-slate-300">
            Built for restaurants, law firms, contractors, and local businesses. Designed to convert. Mobile-first. Accessible. Fast.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/contact" className="rounded-full bg-brand px-6 py-3 font-semibold text-white">Request a Free Site Audit</Link>
            <Link href="/portfolio" className="rounded-full border border-white/20 px-6 py-3 font-semibold text-slate-200">View Demo Sites</Link>
          </div>
          <p className="text-sm text-slate-400">Works with your existing tools. We improve the entry point and conversion layer.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-card">
          <p className="text-sm uppercase tracking-[0.2em] text-teal-300">Conversion Focus</p>
          <ul className="mt-4 space-y-3 text-slate-200">
            <li>Direct orders, bookings, and event actions for restaurants</li>
            <li>Consultation capture and trust-building for law firms</li>
            <li>Quote requests and call conversion for contractors</li>
          </ul>
          <div className="mt-8 animate-pulse text-sm text-slate-400">Scroll to see portfolio and process</div>
        </div>
      </section>

      <section className="section pt-0">
        <h2 className="text-3xl font-semibold text-white">Industry-ready demo previews</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {demoProjects.slice(0, 3).map((project) => (
            <article key={project.name} className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 shadow-card">
              <p className="text-xs uppercase tracking-[0.15em] text-teal-300">{project.industry}</p>
              <h3 className="mt-2 text-xl font-semibold text-white">{project.name}</h3>
              <p className="mt-2 text-sm text-slate-300">{project.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section grid gap-6 border-y border-white/10 md:grid-cols-2">
        <div>
          <h2 className="text-2xl font-semibold text-white">We work with your existing systems</h2>
          <p className="mt-3 text-slate-300">
            We are not replacing your CRM, POS, scheduling, or operations stack. We build the front-end experience that helps customers take action faster.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
          <h3 className="text-lg font-semibold text-white">Simple process</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-300">
            <li>Fast conversion audit</li>
            <li>Design and build aligned to your workflow</li>
            <li>Launch, measure, and iterate</li>
          </ol>
        </div>
      </section>
    </SiteShell>
  );
}
