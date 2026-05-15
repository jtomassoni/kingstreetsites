import { portfolioItems } from "@/lib/site-content";

function ProjectPreview({
  palette,
  name,
  category
}: {
  palette: readonly [string, string, string];
  name: string;
  category: string;
}) {
  const [bg, accent, light] = palette;
  return (
    <div className="relative aspect-[16/10] overflow-hidden rounded-t-2xl" style={{ backgroundColor: bg }}>
      <div className="absolute inset-0 opacity-30" style={{ background: `radial-gradient(circle at 70% 20%, ${accent}, transparent 60%)` }} />
      <div className="relative h-full p-4 sm:p-5 flex flex-col">
        <div className="flex items-center justify-between mb-auto">
          <span className="h-1.5 w-10 rounded-full" style={{ backgroundColor: accent }} />
          <span className="text-[9px] font-medium uppercase tracking-wider" style={{ color: light, opacity: 0.6 }}>
            {category}
          </span>
        </div>
        <div>
          <p className="font-serif text-lg sm:text-xl leading-tight" style={{ color: light }}>
            {name}
          </p>
          <div className="mt-3 flex gap-2">
            <span className="rounded-full px-2.5 py-0.5 text-[8px] font-semibold" style={{ backgroundColor: accent, color: bg }}>
              Get started
            </span>
            <span
              className="rounded-full border px-2.5 py-0.5 text-[8px] font-medium"
              style={{ borderColor: `${light}40`, color: light }}
            >
              Learn more
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Portfolio() {
  return (
    <section id="work" className="section section-pad">
      <div className="max-w-2xl">
        <p className="eyebrow mb-4">Selected work</p>
        <h2 className="heading-section">Stores, kitchens, and local brands that convert.</h2>
        <p className="body-lg mt-4">
          From ecommerce checkout flows to restaurant ordering and private event inquiries — every
          project is built around the action you need visitors to take.
        </p>
      </div>

      <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
        {portfolioItems.map((project) => (
          <article key={project.name} className="card-surface overflow-hidden group">
            <ProjectPreview palette={project.palette} name={project.name} category={project.category} />
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap gap-2 mb-3">
                {project.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-cream-dark px-2.5 py-0.5 text-[11px] font-medium text-ink-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <h3 className="font-semibold text-ink text-lg">{project.name}</h3>
              <p className="mt-2 text-sm text-ink-muted leading-relaxed">{project.description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
