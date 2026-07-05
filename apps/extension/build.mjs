import { build } from "esbuild";

const sharedOptions = {
  bundle: true,
  format: "esm",
  target: "chrome120",
  sourcemap: true,
  logLevel: "info",
};

await Promise.all([
  build({
    ...sharedOptions,
    entryPoints: ["src/content.ts"],
    outfile: "dist/content.js",
  }),
  build({
    ...sharedOptions,
    entryPoints: ["src/background.ts"],
    outfile: "dist/background.js",
  }),
  build({
    ...sharedOptions,
    entryPoints: ["src/options.ts"],
    outfile: "dist/options.js",
  }),
]);
