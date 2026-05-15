"use client";

import { useState } from "react";
import { faqItems } from "@/lib/site-content";

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="section section-pad bg-cream-dark/50">
      <div className="max-w-2xl mx-auto text-center mb-12">
        <p className="eyebrow mb-4">FAQ</p>
        <h2 className="heading-section">Questions we hear often.</h2>
      </div>

      <div className="max-w-2xl mx-auto divide-y divide-ink/10 rounded-2xl border border-ink/[0.06] bg-white overflow-hidden shadow-card">
        {faqItems.map((item, i) => {
          const open = openIndex === i;
          return (
            <div key={item.q}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left hover:bg-cream/50 transition-colors"
                onClick={() => setOpenIndex(open ? null : i)}
                aria-expanded={open}
              >
                <span className="font-semibold text-ink pr-4">{item.q}</span>
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink/10 text-ink-muted transition-transform duration-200 ${open ? "rotate-45" : ""}`}
                >
                  +
                </span>
              </button>
              <div
                className={`grid transition-all duration-200 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
              >
                <div className="overflow-hidden">
                  <p className="px-6 pb-5 text-ink-muted leading-relaxed">{item.a}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
