// Shrinks an image in the browser before it is uploaded.
//
// WHY THIS EXISTS AT ALL, which is not the reason it looks like it exists.
// The API runs as a Vercel serverless function, and Vercel rejects a request
// body over 4.5 MB at the platform edge — before the handler, before multer,
// before any of our own limits are consulted. That rejection carries no CORS
// headers, so the browser refuses to let the page read the response and the
// only thing the app sees is a TypeError reading "Failed to fetch". Nothing
// reaches the server logs, because nothing reached the server.
//
// So the backend's 5 MB image cap and 10 MB multer cap are unreachable on
// Vercel: anything big enough to trip them died two hops earlier. Keeping the
// payload small in the browser is not an optimisation here, it is the only
// place the problem can be solved.

/**
 * The largest body we will ever hand to fetch. Vercel's hard limit is 4.5 MB;
 * this sits a megabyte under it so that multipart boundaries, the other form
 * fields and any proxy re-encoding cannot creep over the line.
 */
export const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024;

export interface ResizePreset {
  /** Cap on the longer edge, in CSS pixels. Aspect ratio is always preserved. */
  maxDimension: number;
  /** Encoder target. The ladder stops as soon as it is met. */
  targetBytes: number;
}

/**
 * One preset per upload `type` the API accepts, so a path added later starts
 * with a considered cap instead of inheriting whatever the last caller used.
 * Only `logo` is reachable from the UI today; the rest are declared because
 * the backend already routes them and would otherwise repeat this bug.
 *
 * The caps differ because the failure mode differs. A logo and a headshot are
 * LOOKED AT — the logo renders at 48px in the sidebar and about 25mm on a
 * report card, so 512px is already several times retina. A receipt or a flyer
 * is READ: it is mostly small text, and text is what dies first when you
 * downscale, so those keep 1600px even though it costs bytes.
 */
export const UPLOAD_PRESETS: Record<string, ResizePreset> = {
  'logo':             { maxDimension: 512,  targetBytes: 300 * 1024 },
  'student-headshot': { maxDimension: 800,  targetBytes: 400 * 1024 },
  'staff-headshot':   { maxDimension: 800,  targetBytes: 400 * 1024 },
  'expense-receipt':  { maxDimension: 1600, targetBytes: 800 * 1024 },
  'event-flyer':      { maxDimension: 1600, targetBytes: 800 * 1024 },
};

const QUALITY_STEPS = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];

/** Thrown when the picked file cannot be turned into pixels at all. */
export class ImageDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageDecodeError';
  }
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

/**
 * Turns the file into something drawable, RIGHT WAY UP.
 *
 * A phone camera writes the sensor's raw pixels and records "…and it should be
 * rotated 90°" in an EXIF tag, so a portrait photo is landscape pixels plus a
 * note. Both branches below honour that note:
 *
 *   createImageBitmap with imageOrientation:'from-image' applies it explicitly.
 *   <img> applies it because CSS image-orientation defaults to from-image, and
 *   drawImage takes the oriented image (Chrome 81+, Safari 13.1+, Firefox 26+).
 *
 * The <img> branch is the important one and did not exist before. The old code
 * called createImageBitmap and, if it threw, uploaded the ORIGINAL file — so on
 * any engine where that call or its options dictionary is unsupported, a 4 MB
 * camera photo went to Vercel untouched and came back as "Failed to fetch".
 * A decode failure must never silently become a full-size upload.
 */
async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Unsupported options dict, or a format this engine cannot decode as a
      // bitmap. Fall through rather than give up.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new ImageDecodeError('decode failed'));
      el.src = url;
    });
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    // Overwhelmingly this is an iPhone HEIC/HEIF that the picker handed over
    // without converting. Name the format and the fix, because "decode failed"
    // tells the person holding the phone nothing they can act on.
    throw new ImageDecodeError(
      "This image could not be read. If it came from an iPhone it may be in HEIC format — open it in Photos, " +
      "choose Duplicate or Export, and pick JPEG."
    );
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

function extensionForMime(mime: string): string {
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/png') return 'png';
  return 'jpg';
}

/** Runs the quality ladder at one output format, returning the smallest blob it managed. */
async function encodeDown(
  canvas: HTMLCanvasElement,
  mime: string,
  targetBytes: number
): Promise<Blob | null> {
  let smallest: Blob | null = null;
  for (const quality of QUALITY_STEPS) {
    const blob = await canvasToBlob(canvas, mime, quality);
    if (!blob) break;
    if (!smallest || blob.size < smallest.size) smallest = blob;
    if (blob.size <= targetBytes) return blob;
  }
  return smallest;
}

/**
 * Downscales to the preset's cap and re-encodes.
 *
 * Note there is no "already small enough, return it untouched" shortcut, and
 * that is deliberate — it is the second half of the original bug. The old code
 * returned the file as-is whenever it was under 4 MB, so a 3.5 MB 4000px
 * camera photo skipped resizing entirely and was uploaded at full size, right
 * up against Vercel's 4.5 MB edge. Pixel count and byte count are different
 * questions and only one of them was being asked.
 */
export async function resizeImageForUpload(file: File, preset: ResizePreset): Promise<File> {
  const { maxDimension, targetBytes } = preset;
  const decoded = await decode(file);

  try {
    const { source, width: srcW, height: srcH } = decoded;
    if (!srcW || !srcH) throw new ImageDecodeError('This image could not be read — it reports no dimensions.');

    // Only ever shrink. Enlarging a small logo would add bytes and no detail.
    const scale = Math.min(1, maxDimension / Math.max(srcW, srcH));
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ImageDecodeError('This browser could not process the image.');
    ctx.drawImage(source, 0, 0, width, height);

    // JPEG composites transparency onto black, so a PNG/WebP logo with a
    // knocked-out background would come back with a black box around it.
    // Those keep an alpha-capable format; photographs go to JPEG.
    const preserveTransparency = file.type === 'image/png' || file.type === 'image/webp';
    let blob = await encodeDown(canvas, preserveTransparency ? 'image/webp' : 'image/jpeg', targetBytes);

    // An engine without WebP encoding silently gives back PNG, which for a
    // detailed image can stay large. Falling back to JPEG costs transparency,
    // so it is only worth it if the alpha-safe attempt actually missed.
    if (blob && blob.size > targetBytes && blob.type !== 'image/jpeg') {
      const jpeg = await encodeDown(canvas, 'image/jpeg', targetBytes);
      if (jpeg && jpeg.size < blob.size) blob = jpeg;
    }

    if (!blob) throw new ImageDecodeError('This browser could not re-encode the image.');

    // Trust the blob's own type: toBlob falls back silently when it cannot
    // honour the requested format, and the extension has to match reality
    // because the server maps MIME to extension on the way into storage.
    const actualMime = blob.type || 'image/jpeg';
    const base = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${base}.${extensionForMime(actualMime)}`, { type: actualMime });
  } finally {
    decoded.release();
  }
}

/** Convenience wrapper for the presets above. */
export function resizeForType(file: File, type: keyof typeof UPLOAD_PRESETS | string): Promise<File> {
  const preset = UPLOAD_PRESETS[type] ?? UPLOAD_PRESETS['logo'];
  return resizeImageForUpload(file, preset);
}

/** Human-readable size for error messages. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
