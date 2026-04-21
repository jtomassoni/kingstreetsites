import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { demoProjects } from "@/lib/data";

export default function PortfolioPage() {
  return (
    <SiteShell>
      <section className="section">
        <h1 className="text-4xl font-semibold text-white">Portfolio and Demo Sites</h1>
        <p className="mt-3 max-w-2xl text-slate-300">Proof of our conversion-focused approach across restaurant, legal, and home service businesses.</p>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {demoProjects.map((project) => (
            <article key={project.name} className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 shadow-card">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.15em] text-teal-300">{project.industry}</p>
                <span className="rounded-full border border-white/20 px-3 py-1 text-xs text-slate-300">{project.badge}</span>
              </div>
              <h2 className="mt-3 text-2xl font-semibold text-white">{project.name}</h2>
              <p className="mt-3 text-slate-300">{project.description}</p>
              <div className="mt-5 h-40 rounded-xl border border-white/10 bg-slate-800/60 p-4 text-sm text-slate-400">{project.imageAlt}</div>
              <Link href={project.href} className="mt-5 inline-block rounded-full bg-brand px-5 py-2 font-semibold text-white">
                View Demo
              </Link>
            </article>
          ))}
        </div>
      </section>
    </SiteShell>
  );
}
