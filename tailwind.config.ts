import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}", "./lib/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        slate: "#1e293b",
        cream: "#f8fafc",
        brand: "#0f766e"
      },
      boxShadow: {
        card: "0 20px 35px -20px rgba(15, 23, 42, 0.35)"
      }
    }
  },
  plugins: []
};

export default config;
