import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}", "./lib/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        crm: {
          bg: "var(--crm-bg)",
          surface: "var(--crm-surface)",
          raised: "var(--crm-raised)",
          border: "var(--crm-border)",
          text: "var(--crm-text)",
          muted: "var(--crm-muted)",
          faint: "var(--crm-faint)",
          accent: "var(--crm-accent)",
          "accent-hover": "var(--crm-accent-hover)",
        },
        ink: {
          DEFAULT: "#0c1222",
          muted: "#3d4a63",
          faint: "#64748b"
        },
        cream: {
          DEFAULT: "#faf8f5",
          dark: "#f0ebe3"
        },
        brand: {
          DEFAULT: "#0d9488",
          light: "#2dd4bf",
          dark: "#0f766e",
          glow: "rgba(13, 148, 136, 0.35)"
        },
        accent: {
          warm: "#d97706",
          rose: "#e11d48"
        }
      },
      fontFamily: {
        sans: ["var(--font-dm-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-instrument)", "Georgia", "serif"]
      },
      boxShadow: {
        card: "0 4px 24px -4px rgba(12, 18, 34, 0.08), 0 12px 48px -12px rgba(12, 18, 34, 0.12)",
        "card-hover": "0 8px 32px -4px rgba(12, 18, 34, 0.12), 0 24px 64px -16px rgba(12, 18, 34, 0.16)",
        glow: "0 0 60px -12px var(--tw-shadow-color)",
        mockup: "0 25px 80px -20px rgba(12, 18, 34, 0.35)"
      },
      animation: {
        "fade-up": "fade-up 0.7s ease-out forwards",
        "fade-in": "fade-in 0.5s ease-out forwards",
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 2.5s ease-in-out infinite"
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" }
        },
        shimmer: {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.8" }
        }
      },
      backgroundImage: {
        "grid-fade":
          "linear-gradient(to right, rgba(12,18,34,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(12,18,34,0.04) 1px, transparent 1px)",
        "hero-glow":
          "radial-gradient(ellipse 80% 60% at 50% -20%, rgba(13,148,136,0.15), transparent 70%)"
      },
      backgroundSize: {
        grid: "48px 48px"
      }
    }
  },
  plugins: []
};

export default config;
