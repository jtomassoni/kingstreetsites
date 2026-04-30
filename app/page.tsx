import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-400 mb-4">King Street Sites</p>
      <h1 className="text-4xl md:text-5xl font-semibold text-white leading-tight max-w-xl">
        Modern websites for restaurants.
        <span className="text-slate-400"> Built for you, not by you.</span>
      </h1>
      <p className="mt-6 text-slate-400 max-w-sm">
        We find your weak spots, build a better site, and show you — before you pay a cent.
      </p>
      <div className="mt-10 flex flex-col sm:flex-row gap-3">
        <a
          href={process.env.NEXT_PUBLIC_CALENDLY_URL ?? "https://calendly.com/kingstreetsites"}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-teal-600 hover:bg-teal-500 transition-colors px-7 py-3 font-semibold text-white"
        >
          Book a call
        </a>
        <Link
          href="/login"
          className="rounded-full border border-white/20 hover:border-white/40 transition-colors px-7 py-3 font-semibold text-slate-300"
        >
          Sign in
        </Link>
      </div>
      <footer className="absolute bottom-6 text-xs text-slate-600">
        © {new Date().getFullYear()} King Street Sites · Denver & Baltimore
      </footer>
    </main>
  );
}
