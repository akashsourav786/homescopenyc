import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure calculation-engine tests run in Node; no DOM needed.
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
