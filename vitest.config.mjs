import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/tools/**/*.test.ts", "tests/meals/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd()),
      "@meals": path.resolve(process.cwd(), "modules/meals"),
      "@arcade": path.resolve(process.cwd(), "modules/arcade"),
      "@movies": path.resolve(process.cwd(), "modules/movies"),
      "@restock": path.resolve(process.cwd(), "modules/restock"),
    },
  },
});
