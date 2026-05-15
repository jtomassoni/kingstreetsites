import { stats } from "@/lib/site-content";

export function StatsStrip() {
  return (
    <section className="border-y border-ink/[0.06] bg-white">
      <div className="section py-10 md:py-12">
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center md:text-left">
              <dt className="font-serif text-3xl sm:text-4xl text-ink tracking-tight">{stat.value}</dt>
              <dd className="mt-1 text-sm text-ink-muted">{stat.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
