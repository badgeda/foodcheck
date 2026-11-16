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
await mkdir("www/libs", { recursive: true });
for (const file of files) {
  await cp(file, `www/${file}`);
}
await cp("node_modules/html5-qrcode/umd/index.min.js", "www/libs/html5-qrcode.min.js");
await cp("node_modules/@zxing/library/umd/index.min.js", "www/libs/zxing.min.js");
console.log("FoodCheck web files and local QR libraries copied to www/");
