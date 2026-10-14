import { defineConfig, type Options } from "tsup";

const shared: Options = {
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
};

export default defineConfig([
  // The core stays free of "use client" so React Server Components can import it.
  { ...shared, entry: { index: "src/index.ts" } },
  {
    ...shared,
    entry: { react: "src/react/index.ts" },
    banner: { js: '"use client";' },
  },
]);
