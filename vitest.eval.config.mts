import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `npm run eval`: the reader's evals (evals/), kept apart from the unit tests.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The evals run on your computer, not in the app: the browser guard doesn't apply.
      "server-only": fileURLToPath(new URL("./evals/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["evals/**/*.eval.ts"],
    testTimeout: 120_000,
  },
});
