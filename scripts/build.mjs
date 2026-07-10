import { copyFile, readFile, writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const src = resolve(root, "src", "three-state-switch-card.js");
const dist = resolve(root, "dist", "three-state-switch-card.js");
await mkdir(resolve(root, "dist"), { recursive: true });
await copyFile(src, dist);

const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
let content = await readFile(dist, "utf8");
content = content.replace(
  /const CARD_VERSION = "[^"]+";/,
  `const CARD_VERSION = "${pkg.version}";`
);
await writeFile(dist, content, "utf8");
console.log(`Built dist/three-state-switch-card.js v${pkg.version}`);
