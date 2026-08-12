/**
 * Where a user in trouble can reach a human.
 *
 * The only place the support number is written down. Both callers read from
 * here: the floating support button, and the "Having trouble receiving your
 * code?" block on the two OTP screens.
 */

/** Digits only, no '+' and no spaces: the form wa.me expects in its path. */
export const SUPPORT_WHATSAPP_NUMBER = '237679379134';

/** E.164, for tel: links. */
export const SUPPORT_PHONE_E164 = '+237679379134';

/** How the number is shown to a human. */
export const SUPPORT_PHONE_DISPLAY = '+237 679 379 134';

/**
 * A plain WhatsApp chat link, with no prefilled message.
 *
 * Used where the surrounding copy already says what the conversation is about —
 * the OTP screens' "Having trouble receiving your code?" block, for one.
 */
export function whatsappLink(): string {
  return `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}`;
}

/**
 * A WhatsApp deep link carrying the page the user was on when they asked for
 * help.
 *
 * The path is the point: "it isn't working" is unanswerable, whereas the same
 * message stamped /students or /finance tells support which screen to open
 * before they reply. encodeURIComponent covers the spaces and punctuation in
 * the sentence as well as anything odd in the path itself.
 */
export function whatsappSupportLink(currentPath: string): string {
  const where = currentPath && currentPath.trim() ? currentPath : 'unknown page';
  const message = `Hello, I need help with the School Information System.\n\nPage: ${where}`;
  return `${whatsappLink()}?text=${encodeURIComponent(message)}`;
}

/** A tel: link the OS dialler picks up. */
export function phoneSupportLink(): string {
  return `tel:${SUPPORT_PHONE_E164}`;
}
