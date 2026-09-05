// One way to put an image on the server, shared by every upload path.
//
// It exists because the two logo paths had drifted into two slightly different
// copies of the same fetch, and only one of them reported anything useful when
// it failed. Anything added later (student headshots, receipts) should call
// this rather than write a third.

import { BASE_URL, redirectForNotApproved } from './api';
import { getToken } from './session';
import {
  formatBytes,
  ImageDecodeError,
  MAX_UPLOAD_BYTES,
  resizeForType,
} from './imageResize';

/** An upload that failed for a reason we can explain to the person who tried it. */
export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

/**
 * Shrinks the file for its type. Decode failures are surfaced, never swallowed:
 * the previous behaviour was to log and upload the original, which is precisely
 * how a 4 MB camera photo reached Vercel and came back as "Failed to fetch".
 */
export async function prepareImage(file: File, type: string): Promise<File> {
  try {
    return await resizeForType(file, type);
  } catch (err) {
    if (err instanceof ImageDecodeError) throw new UploadError(err.message);
    throw new UploadError(
      'This image could not be processed. Try a different photo, or save it as JPEG and pick it again.'
    );
  }
}

/**
 * Sends an already-prepared file. Separate from prepareImage because the
 * onboarding form shrinks at the moment the file is picked (so the preview and
 * the draft hold the small version) but does not send until the whole form is
 * submitted.
 */
export async function postImage(file: File, type: string, entityId?: string): Promise<string> {
  // THE PRE-FLIGHT. Checked here rather than trusted from the resizer, because
  // this is the last point at which we can say something intelligible. One hop
  // later the platform answers with a CORS-less rejection the page cannot read,
  // and every distinguishable cause collapses into the same "Failed to fetch".
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError(
      `This image is still ${formatBytes(file.size)} after being resized, and the limit is ` +
      `${formatBytes(MAX_UPLOAD_BYTES)}. Please choose a smaller image.`
    );
  }

  const token = getToken();
  const body = new FormData();
  body.append('file', file);
  body.append('type', type);
  if (entityId) body.append('entityId', entityId);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    });
  } catch {
    // fetch rejects with a bare TypeError for every network-layer failure and
    // deliberately tells the page nothing more, so this branch cannot diagnose
    // itself. Name both realistic causes instead of guessing one.
    throw new UploadError(
      'The image could not be sent. Check your connection and try again — if it keeps failing, the image may be too large.'
    );
  }

  if (!res.ok) {
    // The API answers { code, error }. Read BOTH: the message is what a person
    // sees, and the code is what tells the difference between failures that
    // look identical from the status alone. Dumping the raw body, which is what
    // this used to do, put a JSON blob in front of the user.
    let detail = '';
    let code = '';
    try {
      const text = await res.text();
      try {
        const parsed = JSON.parse(text);
        detail = typeof parsed?.error === 'string' ? parsed.error : text;
        code = typeof parsed?.code === 'string' ? parsed.code : '';
      } catch {
        detail = text;
      }
    } catch {}

    if (res.status === 413) {
      throw new UploadError('The server rejected this image as too large. Please choose a smaller one.');
    }

    // This call does not go through src/lib/api.ts — it posts FormData, so it
    // builds its own fetch — and so it also misses the redirect that module
    // performs when a school's approval has been withdrawn mid-session. Ask for
    // it here, rather than reporting a withdrawn approval as an expired session:
    // those are different problems with different remedies, and signing in again
    // would not fix this one.
    if (res.status === 403 && code === 'SCHOOL_NOT_APPROVED') {
      redirectForNotApproved();
      throw new UploadError(detail || 'The upload was refused.');
    }

    if (res.status === 401 || res.status === 403) {
      throw new UploadError('Your session has expired. Please sign in again and retry the upload.');
    }
    throw new UploadError(detail || `The upload failed (error ${res.status}). Please try again.`);
  }

  const { path } = await res.json();
  if (!path) throw new UploadError('The upload completed but the server did not return a file path.');
  return path;
}

/** Prepare and send in one step, for callers that upload as soon as a file is picked. */
export async function uploadImage(file: File, type: string, entityId?: string): Promise<string> {
  const prepared = await prepareImage(file, type);
  return postImage(prepared, type, entityId);
}
