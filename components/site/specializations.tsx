import { specializations } from "@/lib/site-content";
import { ServiceIcon } from "./icons";

export function Specializations() {
  return (
    <section id="specialties" className="section section-pad">
      <div className="max-w-2xl mx-auto text-center">
        <p className="eyebrow mb-4">What we specialize in</p>
        <h2 className="heading-section">Ecommerce that converts. Restaurants that fill tables.</h2>
        <p className="body-lg mt-4">
          We go deep where revenue happens online — high-conversion stores and hospitality sites built
          for orders, reservations, and private dining inquiries. Law, home services, and more when
          the fit is right.
        </p>
      </div>

      <div className="mt-14 grid md:grid-cols-2 gap-6 lg:gap-8">
        {specializations.map((spec, i) => (
          <article
            key={spec.title}
            className={`card-surface p-6 sm:p-8 hover:!translate-y-0 ${i < 2 ? "md:ring-1 md:ring-brand/15" : ""}`}
          >
            {i < 2 && (
              <span className="inline-block rounded-full bg-brand/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand mb-4">
                Core specialty
              </span>
            )}
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <ServiceIcon name={spec.icon} className="h-6 w-6" />
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-faint">{spec.title}</p>
            <h3 className="mt-1 font-serif text-xl sm:text-2xl text-ink leading-snug">{spec.headline}</h3>
            <p className="mt-3 text-ink-muted leading-relaxed">{spec.description}</p>
            <ul className="mt-5 space-y-2">
              {spec.highlights.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm text-ink-muted">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  {item}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
