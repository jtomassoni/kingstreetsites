import { processSteps } from "@/lib/site-content";

export function Process() {
  return (
    <section id="process" className="section section-pad">
      <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-start">
        <div>
          <p className="eyebrow mb-4">How it works</p>
          <h2 className="heading-section">A clear path from call to launch.</h2>
          <p className="body-lg mt-4">
            No mystery timelines or surprise invoices. You always know what&apos;s happening and what comes next.
          </p>
        </div>

        <ol className="space-y-0">
          {processSteps.map((step, i) => (
            <li key={step.step} className="relative flex gap-6 pb-10 last:pb-0">
              {i < processSteps.length - 1 && (
                <span className="absolute left-[1.125rem] top-10 bottom-0 w-px bg-ink/10" aria-hidden />
              )}
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brand/30 bg-brand/5 font-mono text-xs font-semibold text-brand">
                {step.step}
              </span>
              <div className="pt-1">
                <h3 className="font-semibold text-lg text-ink">{step.title}</h3>
                <p className="mt-2 text-ink-muted leading-relaxed">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
