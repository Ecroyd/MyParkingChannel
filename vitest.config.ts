import path from "path";

export default {
  test: {
    globals: true,
    environment: "node",
    // Vitest's default excludes, plus gateway/ (a standalone Node package with its own node:test
    // suite). Spelled out rather than importing configDefaults from "vitest/config": this file is
    // type-checked by `next build`, where dev dependencies such as vitest aren't installed.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*",
      "gateway/**",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
};
