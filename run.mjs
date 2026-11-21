import { chromium } from "/tmp/shot173/node_modules/playwright-core/index.mjs";
import { writeFileSync } from "node:fs";

const BASE = "http://localhost:3417";
const PLACES = (process.env.P ?? "new-york,rural-pa,cape-cod").split(",");
const ZOOMS = (process.env.Z ?? "3,6,9,12,15,17").split(",").map(Number);
const MODES = process.argv[2] ? [process.argv[2]] : ["day", "night"];
const out = "/tmp/shots341/out";

const mix = (a, b, t) => a.map((v, i) => Math.round(v * t + b[i] * (1 - t)));
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const N = {
  land: "#4A4380", urban: "#544C8E", water: "#2C2752", building: "#5A5296",
  road: "#6A62A6", pale: "#FFF4DC",
};
const NIGHT = Object.fromEntries(Object.entries(N).map(([k, v]) => [k, [hex(v)]]));
NIGHT.park = [mix(hex("#3F4F6E"), hex(N.land), 0.6), mix(hex("#3F4F6E"), hex(N.urban), 0.6)];

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const rows = [];
for (const mode of MODES) for (const place of PLACES) for (const zoom of ZOOMS) {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const logs = [];
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) logs.push(`http ${r.status()}: ${r.url()}`);
  });
  page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
  const url = `${BASE}/dev/map?place=${place}&zoom=${zoom}&mode=${mode}`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForSelector(".maplibregl-canvas", { timeout: 60000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2500);
  const errors = await page.locator("text=/Map errors:/").innerText();
  const file = `${out}/${mode}-${place}-z${zoom}.png`;
  const png = await page.locator(".maplibregl-canvas").screenshot({ path: file });
  let counts = null;
  if (mode === "night") {
    counts = await page.evaluate(async ({ b64, palette }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = new OffscreenCanvas(img.width, img.height);
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, img.width, img.height).data;
      const res = Object.fromEntries(Object.keys(palette).map((k) => [k, 0]));
      for (let i = 0; i < d.length; i += 4)
        for (const [k, cols] of Object.entries(palette))
          if (cols.some((col) => Math.abs(d[i] - col[0]) + Math.abs(d[i + 1] - col[1]) + Math.abs(d[i + 2] - col[2]) <= 9)) {
            res[k]++;
            break;
          }
      return res;
    }, { b64: png.toString("base64"), palette: NIGHT });
  }
  rows.push({ mode, place, zoom, errors, logs, counts });
  console.log(JSON.stringify(rows.at(-1)));
  await page.close();
}
await browser.close();
writeFileSync(`${out}/results-${MODES.join("-")}.json`, JSON.stringify(rows, null, 1));
