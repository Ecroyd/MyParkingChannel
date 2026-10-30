import path from "path";
import { configDefaults } from "vitest/config";

export default {
  test: {
    globals: true,
    environment: "node",
    // gateway/ is a standalone Node package with its own node:test suite.
    exclude: [...configDefaults.exclude, "gateway/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
};
