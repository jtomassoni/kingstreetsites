import { SiteShell } from "@/components/site-shell";

export default function AboutPage() {
  return (
    <SiteShell>
      <section className="section max-w-3xl">
        <h1 className="text-4xl font-semibold text-white">About King Street Sites</h1>
        <p className="mt-4 text-slate-300">
          We build websites that turn visitors into customers. Our philosophy is simple: real businesses need clear messaging, fast mobile experiences, and low-friction calls to action.
        </p>
        <p className="mt-4 text-slate-300">
          We design around how people actually browse, compare, and contact businesses. We focus on measurable outcomes like direct orders, consultations, quote requests, and inbound calls.
        </p>
        <p className="mt-4 text-slate-300">
          We have practical experience with restaurant workflows and integration layers, and we architect every build to work with existing tools rather than force platform replacements.
        </p>
      </section>
    </SiteShell>
  );
}
