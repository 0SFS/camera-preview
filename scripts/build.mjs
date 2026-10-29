import path from "node:path";
import { createRequire } from "node:module";
import { realpath } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
// Reuse the workspace's existing toolchain; this script never downloads packages or publishes.
const require = createRequire(new URL("../../fly/package.json", import.meta.url));
const { build } = await import(pathToFileURL(require.resolve("vite")).href);
const ui = path.join(await realpath(new URL("../../fly/node_modules/@foss-earth/ui", import.meta.url)), "src/browser/index.ts");
await build({
  root, configFile: false, publicDir: false,
  resolve: { alias: { "@foss-earth/ui/browser": ui } },
  build: {
    outDir: path.join(root, "public"), emptyOutDir: false, minify: false,
    lib: { entry: path.join(root, "src/index.ts"), formats: ["es"], fileName: () => "preview.js" },
  },
});
