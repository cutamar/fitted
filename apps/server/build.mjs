import { build } from "esbuild";

// Bundle our own code (incl. @rb/shared TS sources); keep npm deps external.
await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: true,
  packages: "external",
  alias: { "@rb/shared": "../../packages/shared/src/index.ts" },
});
