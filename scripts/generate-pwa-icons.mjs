/**
 * Generates the PWA icon set in public/icons from public/images/lewa-logo.png.
 *
 * Run by hand, not by the build: `node scripts/generate-pwa-icons.mjs`. The
 * outputs are committed, and this file exists so the next person can see how
 * they were made and remake them when the logo changes.
 *
 * WHY THE OUTPUTS ARE COMMITTED RATHER THAN BUILT. sharp is deliberately not a
 * frontend dependency -- it is a native module with platform-specific binaries,
 * and nothing the app does at runtime or build time needs it. It only happens
 * to be present in node_modules as a transitive dependency of Next, which is
 * enough to run this script locally but is NOT something to rely on: a Next
 * upgrade could drop it tomorrow. So the icons are artefacts in the repo, and a
 * missing sharp is this script's problem alone, never the build's.
 */
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The frontend's own copy first, the backend's as a fallback -- the backend
 * declares sharp properly, so on a machine where Next has stopped pulling it in
 * that is the copy that will still be there.
 */
function loadSharp() {
  const candidates = [
    'sharp',
    path.join(ROOT, '..', 'sis-backend', 'node_modules', 'sharp', 'lib', 'index.js'),
  ];
  for (const spec of candidates) {
    try {
      return require(spec);
    } catch {
      /* try the next one */
    }
  }
  throw new Error(
    'sharp could not be loaded from the frontend or the backend node_modules.\n' +
    'Do NOT add it to the frontend package.json -- run this script from a checkout\n' +
    'where the backend deps are installed, and commit the PNGs it writes.',
  );
}

const SOURCE = path.join(ROOT, 'public', 'images', 'lewa-logo.png');
const OUT_DIR = path.join(ROOT, 'public', 'icons');

/**
 * The share of the icon's width the mark is allowed to occupy, leaving the rest
 * as margin.
 *
 * The margin has to be added here because the mark is TRIMMED first (see
 * below), which removes the source's own padding along with the empty field
 * around it. Without this the mark would run edge to edge, and every launcher
 * that rounds or crops an icon would cut into it.
 */
const MARK_SCALE = 0.78;

const TARGETS = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  // 180 is what iOS asks for; it is the only one of the three that must end up
  // opaque -- see APPLE_FALLBACK_BG.
  { file: 'apple-touch-icon.png', size: 180, apple: true },
];

/**
 * iOS composites an apple-touch-icon's transparent pixels onto BLACK, so a
 * transparent source would arrive on the home screen as a pale blue mark
 * floating in a black tile. White is the fallback because it matches the
 * manifest's background_color. Only used when the source actually has
 * transparency to lose.
 */
const APPLE_FALLBACK_BG = { r: 255, g: 255, b: 255, alpha: 1 };

const sharp = loadSharp();

/**
 * The field the mark sits on, read off the source's top-left pixel rather than
 * hardcoded -- the logo has already been swapped once for a version with a
 * different background, and a hardcoded colour would have silently left a seam
 * around the trimmed mark when that happened.
 *
 * Whatever that pixel is, it is by definition what `trim` treated as the border
 * and what the mark's own anti-aliased edges are blended against, so it is the
 * only colour that composites back seamlessly.
 */
async function readFieldColour() {
  const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const [r, g, b, a] = [data[0], data[1], data[2], data[3]];
  return { r, g, b, alpha: a / 255 };
}

await mkdir(OUT_DIR, { recursive: true });

const field = await readFieldColour();
const sourceIsTransparent = field.alpha === 0;

/**
 * Trimmed to the mark's own bounding box first. The 2000x2000 master carries
 * the mark inside a wide empty field -- about 28% of the canvas is ink -- and
 * resized whole it would land on the home screen as a small mark adrift in a
 * washed tile. Trimming also means the largest icon is a DOWNSCALE of a
 * 564x604 mark rather than an upscale, so nothing here is softened.
 *
 * The threshold is above zero because the field is a flat fill either way,
 * transparent or not, and a hair of tolerance keeps PNG quantisation from
 * leaving a one-pixel frame behind.
 */
const markPng = await sharp(SOURCE).trim({ threshold: 10 }).png().toBuffer();

for (const { file, size, apple } of TARGETS) {
  const background = apple && sourceIsTransparent ? APPLE_FALLBACK_BG : field;

  // `fit: inside` rather than `contain`: the mark is not square, and contain
  // would pad it back out to a square before the composite below centres it,
  // which is the same padding twice.
  const mark = await sharp(markPng)
    .resize(Math.round(size * MARK_SCALE), Math.round(size * MARK_SCALE), { fit: 'inside' })
    .png()
    .toBuffer();

  let pipeline = sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: mark, gravity: 'centre' }]);

  // Only the Apple icon is forced opaque. The Android pair keeps whatever
  // alpha the source had: `purpose: "any"` icons are drawn by the launcher on
  // its own backdrop, so a white square baked in behind a transparent mark
  // would show as a white tile on every launcher that rounds or tints.
  if (apple) pipeline = pipeline.flatten({ background });

  const info = await pipeline.png({ compressionLevel: 9 }).toFile(path.join(OUT_DIR, file));
  console.log(`${file.padEnd(22)} ${info.width}x${info.height}  ${info.channels}ch  ${info.size} bytes`);
}
