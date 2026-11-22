import { build } from "vite";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

await build();

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path));
    else files.push(path);
  }
  return files;
}

const dist = "dist";
const allFiles = await collectFiles(join(dist, "assets"));
const precacheAssets = allFiles
  .map((path) => "./" + relative(dist, path).split(sep).join("/"))
  .sort();
if (new Set(precacheAssets).size !== precacheAssets.length) {
  throw new Error("Generated PWA asset list contains duplicate paths.");
}

const staticPwaAssets = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./icons/icon-planet.svg",
  "./icons/icon-hourglass.svg",
  "./icons/icon-window.svg",
  "./icons/icon-comet.svg"
];

const swPath = join(dist, "sw.js");
const sw = await readFile(swPath, "utf8");
const marker = "const BUILD_ASSETS = [];";
if (!sw.includes(marker)) {
  throw new Error("Service Worker build-asset marker is missing.");
}
const builtSw = sw.replace(marker, `const BUILD_ASSETS = ${JSON.stringify(precacheAssets)};`);
await writeFile(swPath, builtSw);

const html = await readFile(join(dist, "index.html"), "utf8");
if (!/src=["']\.\/assets\/[^"']+\.js["']/.test(html)) {
  throw new Error("Built application entry module was not found in dist/index.html.");
}
for (const url of ["./manifest.webmanifest", "./icon.svg"]) {
  if (!html.includes(url)) throw new Error(`Built HTML is missing relative PWA URL ${url}.`);
}
if (!/rel=["']apple-touch-icon["'] href=["']\.\/[^"']+["']/.test(html)) {
  throw new Error("Built HTML is missing a relative Apple touch icon URL.");
}
if (/\b(?:src|href)=["']\/(?:manifest|icon)/.test(html)) {
  throw new Error("Built PWA contains a domain-root asset URL that would break under /Focus/.");
}
for (const asset of staticPwaAssets.slice(1)) {
  await readFile(join(dist, asset.slice(2)));
}
await readFile(join(dist, "sw.js"));
const manifest = JSON.parse(await readFile(join(dist, "manifest.webmanifest"), "utf8"));
if (manifest.start_url !== "./" || manifest.scope !== "./") {
  throw new Error("PWA manifest must keep relative start_url and scope.");
}
for (const asset of staticPwaAssets) {
  if (!builtSw.includes(`'${asset}'`)) {
    throw new Error(`Built Service Worker is missing static PWA asset ${asset}`);
  }
}
for (const asset of precacheAssets) {
  if (!builtSw.includes(asset)) throw new Error(`Built Service Worker is missing generated asset ${asset}`);
}
console.log(`FOCUS build verified: ${precacheAssets.length} generated assets are precached.`);
