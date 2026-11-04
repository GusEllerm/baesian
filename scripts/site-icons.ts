// The website's icons (M9e step 2), drawn in the client's own look and rendered by Playwright's Chromium, so no image tool
// or dependency is needed: a card the colour of a card's face, in its frame, on the desk's colour, with the wordmark's B
// (Archivo, 800, condensed, in ink), over a second card of the pile behind it. `npx tsx scripts/site-icons.ts` writes them
// into client/site-public/, which the site's build copies as they are; run it again only to change how they look.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "client", "site-public");
const font = readFileSync(join(ROOT, "node_modules", "@fontsource-variable", "archivo", "files", "archivo-latin-wdth-normal.woff2")).toString("base64");

// The client's colours (client/src/style.css).
const DESK = "#d9d0da";
const DESK_DEEP = "#cbc0cd";
const FACE = "#f0e4be";
const FACE_LIGHT = "#f7eed3";
const FRAME = "#cdbe8c";
const INK = "#2e2343";

/**
 * The mark at a size: the desk (full bleed, or a rounded square), and the pile in the middle, scaled to `inset` of the
 * side so a maskable icon keeps it inside the safe zone (the middle 80%).
 */
function mark(opts: { bleed: boolean; inset: number }): string {
  const s = 100;
  const card = 40 * opts.inset;
  const h = card * 1.3;
  const desk = opts.bleed
    ? `<rect width="${s}" height="${s}" fill="url(#desk)"/>`
    : `<rect x="2" y="2" width="${s - 4}" height="${s - 4}" rx="22" fill="url(#desk)"/>`;
  const face = (fill: string, rot: number, dx: number) =>
    `<g transform="translate(${50 + dx} 51) rotate(${rot})"><rect x="${-card / 2}" y="${-h / 2}" width="${card}" height="${h}" rx="${card * 0.12}" fill="${fill}" stroke="${FRAME}" stroke-width="${card * 0.07}"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="100%" height="100%">
    <defs><radialGradient id="desk" cx="50%" cy="0%" r="120%"><stop offset="0" stop-color="${DESK}"/><stop offset="1" stop-color="${DESK_DEEP}"/></radialGradient></defs>
    ${desk}
    ${face(FACE_LIGHT, -9, -card * 0.1)}
    ${face(FACE, 4, card * 0.06)}
    <text x="${50 + card * 0.07}" y="${51 + card * 0.33}" transform="rotate(4 ${50 + card * 0.06} 51)" text-anchor="middle" fill="${INK}" style="font: 800 ${card * 0.92}px 'Archivo'; font-stretch: 72%">B</text>
  </svg>`;
}

/** The badge Android shows in the status bar: the B alone, white on nothing, which the system tints. */
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><text x="50" y="84" text-anchor="middle" fill="#fff" style="font: 800 104px 'Archivo'; font-stretch: 72%">B</text></svg>`;

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const render = async (svg: string, size: number, transparent: boolean): Promise<Buffer> => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<!doctype html><style>@font-face { font-family: Archivo; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 100 900; font-stretch: 62% 125%; }
      html, body { margin: 0; width: ${size}px; height: ${size}px; background: transparent; } svg { display: block; }</style>${svg}`);
    await page.evaluate("document.fonts.ready");
    return page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
  };
  const write = (name: string, bytes: Buffer) => {
    writeFileSync(join(OUT, name), bytes);
    console.log(`wrote client/site-public/${name} (${bytes.length} bytes)`);
  };
  // "any": a rounded square, as Chrome and Edge show an installed app's icon on a desktop.
  write("icons/icon-192.png", await render(mark({ bleed: false, inset: 1 }), 192, true));
  write("icons/icon-512.png", await render(mark({ bleed: false, inset: 1 }), 512, true));
  // "maskable": full bleed, the pile inside the middle 80%, for Android's shapes.
  write("icons/maskable-512.png", await render(mark({ bleed: true, inset: 0.8 }), 512, false));
  // iOS's Home Screen: opaque, full bleed; iOS rounds the corners itself.
  write("icons/apple-touch-icon.png", await render(mark({ bleed: true, inset: 0.92 }), 180, false));
  write("icons/badge-96.png", await render(badge, 96, true));
  // The tab's icon: favicon.ico, one 32 px PNG inside, which every browser reads.
  write("favicon.ico", ico(await render(mark({ bleed: false, inset: 1.12 }), 32, true), 32));
  await browser.close();
}

/** An ICO file holding one PNG (Windows Vista's format, which browsers read). */
function ico(png: Buffer, size: number): Buffer {
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // an icon
  header.writeUInt16LE(1, 4); // one image
  header.writeUInt8(size, 6);
  header.writeUInt8(size, 7);
  header.writeUInt8(0, 8); // no palette
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10); // planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18); // where the PNG starts
  return Buffer.concat([header, png]);
}

await main();
