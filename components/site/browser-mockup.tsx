export function BrowserMockup() {
  return (
    <div className="relative w-full max-w-lg mx-auto animate-float">
      <div className="absolute -inset-4 rounded-3xl bg-brand/20 blur-3xl opacity-60" aria-hidden />
      <div className="relative rounded-2xl border border-ink/10 bg-white shadow-mockup overflow-hidden">
        <div className="flex items-center gap-2 border-b border-ink/5 bg-cream-dark/80 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          </div>
          <div className="flex-1 mx-2 rounded-md bg-white border border-ink/8 px-3 py-1 text-[10px] text-ink-faint truncate">
            monaghanspub.com
          </div>
        </div>

        <div className="aspect-[4/3] bg-gradient-to-br from-[#1a2e1a] via-[#243d24] to-[#1a2e1a] p-5 sm:p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <div className="h-2 w-16 rounded-full bg-[#c9a227]/90" />
            <div className="flex gap-2">
              <div className="h-1.5 w-8 rounded-full bg-white/20" />
              <div className="h-1.5 w-8 rounded-full bg-white/20" />
              <div className="h-1.5 w-8 rounded-full bg-white/20 hidden sm:block" />
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center">
            <p className="text-[#c9a227] text-[9px] sm:text-[10px] font-semibold uppercase tracking-widest mb-2">
              Est. 1987 · Denver
            </p>
            <h3 className="font-serif text-white text-xl sm:text-2xl leading-tight mb-2">
              Your neighborhood,
              <br />
              <span className="text-[#f5f0e8]/90">elevated.</span>
            </h3>
            <p className="text-white/50 text-[9px] sm:text-[10px] max-w-[200px] leading-relaxed mb-4">
              Craft beer, classic fare, and the kind of atmosphere you keep coming back to.
            </p>
            <div className="flex gap-2">
              <span className="rounded-full bg-[#c9a227] px-3 py-1 text-[8px] sm:text-[9px] font-semibold text-[#1a2e1a]">
                Reserve a table
              </span>
              <span className="rounded-full border border-white/25 px-3 py-1 text-[8px] sm:text-[9px] font-medium text-white/80">
                View menu
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg bg-white/5 border border-white/10 aspect-[4/3]" />
            ))}
          </div>
        </div>
      </div>

      <div className="absolute -left-4 sm:-left-8 top-1/4 rounded-xl border border-ink/8 bg-white px-3 py-2 shadow-card text-xs font-medium text-ink hidden sm:block">
        <span className="text-brand">↑ 94</span> Lighthouse
      </div>
      <div className="absolute -right-2 sm:-right-6 bottom-1/4 rounded-xl border border-ink/8 bg-white px-3 py-2 shadow-card text-xs font-medium text-ink hidden sm:block">
        Mobile-first
      </div>
    </div>
  );
}
