"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { calendlyUrl, navLinks } from "@/lib/site-content";
import { IconClose, IconMenu } from "./icons";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-cream/90 backdrop-blur-lg shadow-[0_1px_0_rgba(12,18,34,0.06)]" : "bg-transparent"
      }`}
    >
      <div className="section flex h-16 md:h-[4.5rem] items-center justify-between">
        <Link href="/" className="group flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink font-serif text-lg text-brand-light">
            K
          </span>
          <span className="font-semibold text-ink tracking-tight">
            King Street <span className="text-ink-muted font-normal">Sites</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="btn-ghost">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/login" className="btn-ghost text-sm">
            Sign in
          </Link>
          <a href={calendlyUrl} target="_blank" rel="noopener noreferrer" className="btn-primary text-sm py-3 px-6">
            Book a call
          </a>
        </div>

        <button
          type="button"
          className="md:hidden flex h-10 w-10 items-center justify-center rounded-lg text-ink hover:bg-ink/5"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <IconClose className="h-5 w-5" /> : <IconMenu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden fixed inset-0 top-16 z-40 bg-cream/98 backdrop-blur-xl">
          <nav className="section flex flex-col gap-1 pt-6">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-xl px-4 py-3.5 text-lg font-medium text-ink hover:bg-ink/5"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <hr className="my-4 border-ink/10" />
            <a
              href={calendlyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary w-full text-center"
              onClick={() => setOpen(false)}
            >
              Book a call
            </a>
            <Link href="/login" className="btn-secondary w-full text-center mt-3" onClick={() => setOpen(false)}>
              Sign in
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
