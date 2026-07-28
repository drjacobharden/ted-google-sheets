import { build } from "bun";

const result = await build({
  entrypoints: ["./src/main.ts"],
  outdir: "./dist",
  naming: "bundle.js",
});

if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}
