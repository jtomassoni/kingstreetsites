import { ContactForm } from "@/components/contact-form";
import { SiteShell } from "@/components/site-shell";

export default function ContactPage() {
  return (
    <SiteShell>
      <section className="section grid gap-8 md:grid-cols-[0.9fr_1.1fr]">
        <div>
          <h1 className="text-4xl font-semibold text-white">Request a Free Site Audit</h1>
          <p className="mt-4 text-slate-300">
            Share your business details and goals. We will send practical feedback focused on conversion, trust, mobile usability, and action clarity.
          </p>
          <ul className="mt-5 space-y-2 text-slate-300">
            <li>Designed to convert</li>
            <li>Works with your existing tools</li>
            <li>Low-friction next steps</li>
          </ul>
        </div>
        <ContactForm />
      </section>
    </SiteShell>
  );
}
