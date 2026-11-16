import { cp, mkdir, rm } from "node:fs/promises";

const files = [
  "index.html",
  "app.js",
  "icon-192.png",
  "icon-512.png",
  "icon.svg",
  "manifest.webmanifest"
];

await rm("www", { recursive: true, force: true });
await mkdir("www", { recursive: true });
for (const file of files) {
  await cp(file, `www/${file}`);
}
console.log("FoodCheck web files copied to www/");
