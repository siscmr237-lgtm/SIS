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

/**
 * The maskable icon's mark is much smaller than the others, and that is the
 * entire point of it.
 *
 * Android crops a maskable icon to whatever shape the launcher uses -- circle,
 * squircle, teardrop -- and guarantees only the middle 80% survives, which is a
 * CIRCLE of that diameter and not a square. Anything outside it is liable to be
 * cut.
 *
 * 59 rather than a round 60 because 60 does not quite fit. The mark is wider
 * than the circle allows at its corners: measured at 0.6, the corner of the "A"
 * in LEWA lands 1.3px beyond the safe radius, solid ink rather than the faint
 * edge of an anti-aliased one. Invisible in practice, and free to avoid -- the
 * 1.7% this gives up cannot be seen at any size a launcher draws. At 0.59 the
 * furthest ink sits at about 99% of the guaranteed radius, so nothing depends
 * on which shape a given launcher happens to crop to.
 *
 * The bleed this leaves is the navy. Without a maskable icon Android takes the
 * ordinary one and letterboxes it inside a white circle, which is the thing
 * this file exists to stop.
 */
const MASKABLE_SCALE = 0.59;

/** The navy the manifest already names as theme_color. */
const NAVY = { r: 0x0f, g: 0x23, b: 0x45, alpha: 1 };

const TARGETS = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  // 180 is what iOS asks for. See APPLE_FALLBACK_BG for why it is opaque.
  { file: 'apple-touch-icon.png', size: 180, apple: true },
  /**
   * `lift` is what makes this one possible at all. The logo PNG is opaque:
   * the mark comes with its own pale field baked in, and dropped onto navy as
   * it is, it would land as a pale square with the mark inside it rather than
   * a mark on navy. See liftMarkOffItsField.
   *
   * Opaque because a maskable icon must fill its whole canvas -- the launcher
   * crops into it, and any transparency would let the launcher's own
   * background show through the corners it did not crop.
   */
  {
    file: 'icon-512-maskable.png',
    size: 512,
    scale: MASKABLE_SCALE,
    background: NAVY,
    lift: true,
    opaque: true,
  },
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

/**
 * Recovers the mark as a transparent PNG from an opaque one, so it can be put
 * on a background other than the one it shipped on.
 *
 * The logo is a single flat colour on a single flat field, which is what makes
 * this exact rather than a guess. Every pixel in it is
 *
 *   pixel = coverage * mark + (1 - coverage) * field
 *
 * -- solid mark where coverage is 1, bare field where it is 0, and a partial
 * blend along every anti-aliased edge. That equation has one unknown, so it
 * inverts per channel:
 *
 *   coverage = (field - pixel) / (field - mark)
 *
 * and the result is written straight back out as alpha over a flat mark
 * colour. Doing it this way rather than keying out "pixels near the field
 * colour" is the difference between edges that stay smooth against navy and
 * edges that come back jagged, because the partly-covered pixels get their
 * true fractional alpha instead of being forced to 0 or 1.
 *
 * Both colours are measured rather than hardcoded, for the same reason
 * readFieldColour measures: the logo has been swapped once already.
 */
async function liftMarkOffItsField(trimmedPng, fieldColour) {
  const { data, info } = await sharp(trimmedPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const field = [fieldColour.r, fieldColour.g, fieldColour.b];
  const distanceFromField = (i) =>
    (data[i] - field[0]) ** 2 + (data[i + 1] - field[1]) ** 2 + (data[i + 2] - field[2]) ** 2;

  // The mark's colour is whatever sits furthest from the field. Averaging the
  // pixels at that extreme rather than taking a single one keeps one stray
  // pixel from defining it.
  let furthest = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const d = distanceFromField(i);
    if (d > furthest) furthest = d;
  }
  const totals = [0, 0, 0];
  let counted = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (distanceFromField(i) < 0.98 * furthest) continue;
    totals[0] += data[i];
    totals[1] += data[i + 1];
    totals[2] += data[i + 2];
    counted += 1;
  }
  const mark = totals.map((t) => Math.round(t / counted));

  // Solved on the channel where the two colours are furthest apart, which is
  // the one where a rounding error in an 8-bit pixel moves the answer least.
  const separation = field.map((f, c) => f - mark[c]);
  let channel = 0;
  for (let c = 1; c < 3; c += 1) {
    if (Math.abs(separation[c]) > Math.abs(separation[channel])) channel = c;
  }

  const out = Buffer.alloc((data.length / info.channels) * 4);
  for (let i = 0, o = 0; i < data.length; i += info.channels, o += 4) {
    const coverage = (field[channel] - data[i + channel]) / separation[channel];
    out[o] = mark[0];
    out[o + 1] = mark[1];
    out[o + 2] = mark[2];
    out[o + 3] = Math.round(Math.min(1, Math.max(0, coverage)) * 255);
  }

  console.log(
    `  lifted mark #${mark.map((v) => v.toString(16).padStart(2, '0')).join('')} ` +
    `off field #${field.map((v) => v.toString(16).padStart(2, '0')).join('')} ` +
    `via ${'RGB'[channel]} (${counted} solid px)`,
  );

  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
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

/** Computed once, and only when a target actually asks to be lifted. */
const liftedMark = TARGETS.some((t) => t.lift) ? await liftMarkOffItsField(markPng, field) : null;

for (const target of TARGETS) {
  const { file, size, apple, lift, opaque, scale = MARK_SCALE } = target;
  const background = target.background ?? (apple && sourceIsTransparent ? APPLE_FALLBACK_BG : field);
  const box = Math.round(size * scale);

  // `fit: inside` rather than `contain`: the mark is not square, and contain
  // would pad it back out to a square before the composite below centres it,
  // which is the same padding twice.
  const mark = await sharp(lift ? liftedMark : markPng)
    .resize(box, box, { fit: 'inside' })
    .png()
    .toBuffer();

  let pipeline = sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: mark, gravity: 'centre' }]);

  // The Apple and maskable icons are forced opaque; both are drawn by the OS
  // onto a shape of its choosing and must fill it. The `purpose: "any"`
  // Android pair is not: those are drawn on the launcher's own backdrop, so a
  // white square baked in behind a transparent mark would show as a white tile
  // on every launcher that rounds or tints.
  if (apple || opaque) pipeline = pipeline.flatten({ background });

  const info = await pipeline.png({ compressionLevel: 9 }).toFile(path.join(OUT_DIR, file));
  console.log(`${file.padEnd(24)} ${info.width}x${info.height}  ${info.channels}ch  ${info.size} bytes`);
}
