import { services } from "@/lib/site-content";
import { ServiceIcon } from "./icons";

export function Services() {
  return (
    <section id="services" className="section section-pad bg-cream-dark/50">
      <div className="max-w-2xl mx-auto text-center">
        <p className="eyebrow mb-4">What we do</p>
        <h2 className="heading-section">Built for the moment money changes hands.</h2>
        <p className="body-lg mt-4">
          Whether it&apos;s a completed checkout, a delivery order, or a private dining inquiry — we
          design the path from landing to conversion and measure what matters.
        </p>
      </div>

      <div className="mt-14 grid sm:grid-cols-2 gap-6 lg:gap-8">
        {services.map((service) => (
          <article
            key={service.title}
            className="card-surface p-6 sm:p-8 hover:!translate-y-0 hover:shadow-card"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <ServiceIcon name={service.icon} className="h-6 w-6" />
            </div>
            <h3 className="mt-5 font-semibold text-xl text-ink">{service.title}</h3>
            <p className="mt-3 text-ink-muted leading-relaxed">{service.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
