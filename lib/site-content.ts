export const calendlyUrl =
  process.env.NEXT_PUBLIC_CALENDLY_URL ?? "https://calendly.com/kingstreetsites";

export const contactEmail =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "hello@kingstreetsites.com";

export const navLinks = [
  { href: "#specialties", label: "Specialties" },
  { href: "#work", label: "Work" },
  { href: "#services", label: "Services" },
  { href: "#process", label: "Process" },
  { href: "#faq", label: "FAQ" }
] as const;

export const specializations = [
  {
    title: "Ecommerce",
    headline: "Stores built to convert — not just look good.",
    description:
      "Product pages, cart flows, and checkout paths engineered for fewer drop-offs. Upsells, trust signals, speed, and mobile checkout that actually finishes.",
    highlights: [
      "Conversion-focused product & collection pages",
      "Streamlined cart and checkout UX",
      "Speed and Core Web Vitals tuned for sales"
    ],
    icon: "cart" as const
  },
  {
    title: "Restaurants",
    headline: "Ordering and private dining leads, optimized.",
    description:
      "Menus that drive online orders, reservation and private-event inquiry flows, and CTAs placed where hungry customers actually tap — especially on mobile.",
    highlights: [
      "Online ordering paths with minimal friction",
      "Private dining & event lead capture",
      "Menus, hours, and location built for local search"
    ],
    icon: "utensils" as const
  },
  {
    title: "Law firms",
    headline: "Trust-first sites that book consultations.",
    description:
      "Clear practice areas, credible tone, and consultation CTAs above the fold — so visitors know they're in the right place before they ever pick up the phone.",
    highlights: ["Practice-area clarity", "Consultation CTAs", "Accessible, authoritative design"],
    icon: "scale" as const
  },
  {
    title: "Home services",
    headline: "Quotes and calls, without the runaround.",
    description:
      "Service-area pages, seasonal offers, and estimate requests designed to turn search traffic into booked jobs — HVAC, remodeling, and trades.",
    highlights: ["Quote & estimate forms", "Local SEO structure", "Project galleries & proof"],
    icon: "home" as const
  }
] as const;

export const portfolioItems = [
  {
    name: "Monaghan's",
    category: "Restaurant",
    description:
      "Neighborhood pub with menu discovery, event promotion, and private dining inquiry flows — built to fill tables and capture group bookings.",
    palette: ["#1a2e1a", "#c9a227", "#f5f0e8"],
    tags: ["Private dining", "Reservations", "Mobile ordering"]
  },
  {
    name: "Outrun Burger",
    category: "Ghost kitchen",
    description:
      "Delivery-first brand with order-optimized hero, menu highlights, and persistent CTAs tuned for late-night mobile conversions.",
    palette: ["#0c0c0f", "#ff4d2e", "#f8f6f3"],
    tags: ["Online ordering", "Delivery UX", "High conversion"]
  },
  {
    name: "Mile High Injury Law",
    category: "Law firm",
    description: "Trust-forward layout with clear practice areas and consultation CTAs above the fold.",
    palette: ["#0f2744", "#c4a35a", "#faf9f7"],
    tags: ["Consultation", "Trust", "SEO"]
  },
  {
    name: "Denver Family & Estate Law",
    category: "Law firm",
    description: "Calm, authoritative design for sensitive family and estate planning decisions.",
    palette: ["#2d3a4a", "#8b9a7d", "#f7f5f2"],
    tags: ["Accessibility", "Clarity", "Forms"]
  },
  {
    name: "Summit Air Denver",
    category: "Home services",
    description: "HVAC brand focused on fast quotes, service areas, and seasonal offer visibility.",
    palette: ["#0e3d5c", "#38bdf8", "#f0f9ff"],
    tags: ["Lead gen", "Local SEO", "Scheduling"]
  },
  {
    name: "Elevate Remodeling",
    category: "Home services",
    description: "Before-and-after storytelling with project galleries and estimate requests.",
    palette: ["#292524", "#d97706", "#fafaf9"],
    tags: ["Gallery", "Portfolio", "Quotes"]
  }
] as const;

export const services = [
  {
    title: "Ecommerce conversion",
    description:
      "Shopify, WooCommerce, or custom storefronts — we design product pages, cart flows, and checkout experiences that reduce abandonment and lift completed orders.",
    icon: "cart"
  },
  {
    title: "Restaurant & hospitality",
    description:
      "Online ordering funnels, private dining lead forms, reservations, and menu UX — so every visit to your site has a clear path to order, book, or inquire.",
    icon: "utensils"
  },
  {
    title: "Performance & SEO",
    description:
      "Fast loads, clean markup, and local search structure — whether you're ranking for “HVAC repair Denver” or “best burgers delivery.”",
    icon: "zap"
  },
  {
    title: "Launch & handoff",
    description:
      "Analytics, conversion tracking, hosting guidance, and a site your team can maintain — with the metrics that matter wired in from day one.",
    icon: "rocket"
  }
] as const;

export const processSteps = [
  {
    step: "01",
    title: "Discovery call",
    description: "We learn your business, goals, and what your current site is costing you."
  },
  {
    step: "02",
    title: "Concept & preview",
    description: "You see a real design direction for your brand — not a generic mockup."
  },
  {
    step: "03",
    title: "Build & refine",
    description: "We develop on modern stacks, test on real devices, and iterate with your feedback."
  },
  {
    step: "04",
    title: "Launch",
    description: "Go live with confidence. We handle the technical lift so you stay focused on customers."
  }
] as const;

export const faqItems = [
  {
    q: "Do I really get to see a preview before paying?",
    a: "Yes. For qualified projects we build a concept you can react to before any major commitment. We want you confident in the direction — not guessing."
  },
  {
    q: "What do you specialize in?",
    a: "High-conversion ecommerce stores and restaurant websites — online ordering, private dining lead capture, reservations, and menu UX. We also build for law firms, home services, and other local businesses where trust and clear CTAs drive revenue."
  },
  {
    q: "Can you integrate with our ordering or POS system?",
    a: "Yes. We work with common ordering platforms, reservation tools, and ecommerce stacks — or design custom flows that hand off cleanly to the systems you already use."
  },
  {
    q: "How long does a typical project take?",
    a: "Most marketing sites land in 3–6 weeks depending on scope, content readiness, and feedback cycles. Rush timelines are possible when the scope is tight."
  },
  {
    q: "Can you work with my existing brand?",
    a: "Absolutely. We elevate what you have — logos, colors, photography — or help you tighten the visual system if things have drifted."
  },
  {
    q: "Will I be able to update the site myself?",
    a: "We set you up for success with sensible content patterns and guidance. For ongoing changes, we offer support or can recommend approaches that fit your team."
  }
] as const;

export const stats = [
  { value: "100%", label: "Mobile-first builds" },
  { value: "CRO", label: "Ecommerce conversion UX" },
  { value: "UX", label: "Restaurant ordering flows" },
  { value: "0", label: "Template lock-in" }
] as const;

export const heroBullets = [
  "Ecommerce built to convert",
  "Restaurant ordering & private dining",
  "Law, home services & more",
  "Denver & Baltimore"
] as const;
