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

const bundlePath = "./dist/bundle.js";
const bundle = await Bun.file(bundlePath).text();
await Bun.write(bundlePath, `(() => {\n${bundle}\n})();\n`);
