export type DemoProject = {
  name: string;
  industry: "Restaurant" | "Law Firm" | "Contractor";
  description: string;
  href: string;
  badge: string;
  imageAlt: string;
};

export const demoProjects: DemoProject[] = [
  {
    name: "Monaghan's",
    industry: "Restaurant",
    description: "Established live restaurant site focused on faster menu discovery, clearer navigation, and direct customer actions.",
    href: "#",
    badge: "Live Reference",
    imageAlt: "Warm upscale restaurant dining room with polished wood tables, amber pendant lighting, and an inviting evening ambiance"
  },
  {
    name: "Outrun Burger",
    industry: "Restaurant",
    description: "Bold late-night ghost kitchen concept designed to drive direct online orders on mobile.",
    href: "/portfolio",
    badge: "Demo",
    imageAlt: "Moody late-night burger and fries on a stainless steel counter with neon reflections and dark cinematic lighting"
  },
  {
    name: "Mile High Injury Law",
    industry: "Law Firm",
    description: "Authority-first personal injury site with clear trust signals and consultation-focused conversion paths.",
    href: "/portfolio",
    badge: "Demo",
    imageAlt: "Professional downtown law office with floor-to-ceiling windows, dark wood conference table, and subtle mountain skyline backdrop"
  },
  {
    name: "Denver Family & Estate Law",
    industry: "Law Firm",
    description: "Calm and reassuring family and estate law experience focused on reducing friction for consultation requests.",
    href: "/portfolio",
    badge: "Demo",
    imageAlt: "Bright and calming legal consultation space with soft neutral tones, organized documents, and natural window light"
  },
  {
    name: "Summit Air Denver",
    industry: "Contractor",
    description: "High-urgency HVAC lead funnel with above-the-fold service request form and instant call options.",
    href: "/portfolio",
    badge: "Demo",
    imageAlt: "HVAC technician in clean branded uniform inspecting a residential air handler in a modern mechanical room"
  },
  {
    name: "Elevate Remodeling",
    industry: "Contractor",
    description: "Premium remodeling showcase with aspirational visuals, before-and-after proof, and quote conversion flow.",
    href: "/portfolio",
    badge: "Demo",
    imageAlt: "Luxury contemporary kitchen remodel with waterfall island, brushed brass fixtures, and floor-to-ceiling natural light"
  }
];

export const servicePillars = [
  "Website design and development",
  "Conversion-focused UX",
  "Mobile-first performance",
  "Accessibility best practices",
  "Resend-powered communication workflows",
  "Integration with your existing tools"
];
