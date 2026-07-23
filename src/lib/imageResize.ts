// Resizes/re-encodes an image file client-side before upload so it comfortably
// fits under the backend's size limit, without ever flattening transparency
// onto a solid background.

const MAX_DIMENSION = 1600;
const TARGET_BYTES = 4 * 1024 * 1024; // real margin under the backend's 5MB cap
const QUALITY_STEPS = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
      mime,
      quality
    );
  });
}

function extensionForMime(mime: string): string {
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/png') return 'png';
  return 'jpg';
}

/**
 * Returns the original file unchanged if it's already well under the target
 * size. Otherwise caps the longest dimension at ~1600px and re-encodes at
 * progressively lower quality until it fits. PNG/WebP sources (which may carry
 * transparency) are re-encoded as WebP rather than JPEG, which would flatten
 * transparent areas onto a solid color.
 */
export async function compressImageForUpload(file: File): Promise<File> {
  if (file.size <= TARGET_BYTES) return file;

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const preserveTransparency = file.type === 'image/png' || file.type === 'image/webp';
    const requestedMime = preserveTransparency ? 'image/webp' : 'image/jpeg';

    let lastBlob: Blob | null = null;
    for (const quality of QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, requestedMime, quality);
      lastBlob = blob;
      if (blob.size <= TARGET_BYTES) break;
    }
    if (!lastBlob) return file;

    // Browsers that don't support the requested mime silently fall back to PNG —
    // trust the blob's actual type, not what we asked for.
    const actualMime = lastBlob.type || requestedMime;
    const newName = file.name.replace(/\.[^.]+$/, '') + '.' + extensionForMime(actualMime);
    return new File([lastBlob], newName, { type: actualMime });
  } finally {
    bitmap.close();
  }
}
