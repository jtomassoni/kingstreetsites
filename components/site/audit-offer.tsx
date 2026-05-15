import { calendlyUrl } from "@/lib/site-content";
import { IconArrowRight, IconCheck } from "./icons";

const benefits = [
  "A real design direction — not a stock template preview",
  "Mobile and desktop layouts you can react to",
  "Clear next steps with no pressure to commit"
];

export function AuditOffer() {
  return (
    <section className="section section-pad">
      <div className="relative overflow-hidden rounded-3xl bg-ink text-cream p-8 sm:p-12 lg:p-16">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_100%_0%,rgba(45,212,191,0.2),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_0%_100%,rgba(45,212,191,0.1),transparent_50%)]" />

        <div className="relative grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-light mb-4">
              Our difference
            </p>
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-[2.75rem] leading-tight tracking-tight">
              See your new site before you pay a cent.
            </h2>
            <p className="mt-5 text-cream/70 text-lg leading-relaxed max-w-lg">
              Whether you&apos;re launching a store or rebuilding a restaurant site — we believe you
              should love the direction before any major investment. For qualified projects, we build
              a concept you can see, share, and refine — then decide.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 sm:p-8">
            <ul className="space-y-4">
              {benefits.map((item) => (
                <li key={item} className="flex gap-3 text-cream/90">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/20 text-brand-light">
                    <IconCheck className="h-3.5 w-3.5" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <a
              href={calendlyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-brand-light px-7 py-3.5 text-sm font-semibold text-ink transition-colors hover:bg-white"
            >
              Start with a conversation
              <IconArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
