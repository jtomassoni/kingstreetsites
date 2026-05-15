import { calendlyUrl, contactEmail } from "@/lib/site-content";
import { IconArrowRight } from "./icons";

export function CtaBand() {
  return (
    <section id="contact" className="section section-pad">
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="heading-section">Selling online or filling tables?</h2>
        <p className="body-lg mt-4">
          Tell us about your store, restaurant, or brand. We&apos;ll talk conversion, ordering flows,
          and whether we&apos;re the right fit — no pitch deck required.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <a href={calendlyUrl} target="_blank" rel="noopener noreferrer" className="btn-primary">
            Book a free call
            <IconArrowRight className="h-4 w-4" />
          </a>
          <a href={`mailto:${contactEmail}`} className="btn-secondary">
            {contactEmail}
          </a>
        </div>
      </div>
    </section>
  );
}
