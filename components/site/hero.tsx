import { calendlyUrl, heroBullets } from "@/lib/site-content";
import { IconArrowRight } from "./icons";
import { BrowserMockup } from "./browser-mockup";

export function Hero() {
  return (
    <section className="relative min-h-[100dvh] flex flex-col pt-24 pb-16 md:pt-28 md:pb-24 overflow-hidden">
      <div className="absolute inset-0 bg-hero-glow pointer-events-none" />
      <div className="absolute inset-0 bg-grid-fade bg-grid opacity-60 pointer-events-none" />

      <div className="section flex-1 flex flex-col lg:flex-row lg:items-center gap-12 lg:gap-16">
        <div className="flex-1 text-center lg:text-left">
          <p className="eyebrow animate-fade-up animate-on-load mb-5">Ecommerce & restaurant web specialists</p>
          <h1 className="heading-display animate-fade-up animate-on-load stagger-1">
            Sites that convert
            <br />
            <span className="italic text-gradient">orders, bookings,</span> and sales.
          </h1>
          <p className="body-lg mt-6 max-w-xl mx-auto lg:mx-0 animate-fade-up animate-on-load stagger-2">
            We specialize in high-conversion ecommerce and restaurant websites — optimized online
            ordering, private dining lead capture, and checkout flows that finish. Plus law, home
            services, and local brands that need to win on mobile.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start animate-fade-up animate-on-load stagger-3">
            <a href={calendlyUrl} target="_blank" rel="noopener noreferrer" className="btn-primary">
              Book a free call
              <IconArrowRight className="h-4 w-4" />
            </a>
            <a href="#work" className="btn-secondary">
              View our work
            </a>
          </div>
          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 justify-center lg:justify-start text-sm text-ink-muted animate-fade-up animate-on-load stagger-4">
            {heroBullets.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex-1 w-full max-w-xl lg:max-w-none mx-auto animate-fade-up animate-on-load stagger-5">
          <BrowserMockup />
        </div>
      </div>
    </section>
  );
}
