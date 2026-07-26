import { build } from "bun";

// Force a clean build instantly
await build({
  entrypoints: ["./src/router.ts"], // The direct source file to look for
  outdir: "./dist", // The destination folder
  naming: "bundle.js", // Explicitly name the output file
  // Optional: Set to true if you want background watch compilation active later
  // watch: true,
});
