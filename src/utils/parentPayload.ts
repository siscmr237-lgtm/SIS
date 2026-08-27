export interface ParentBaseline {
  id: number | null;
  name: string;
  phone: string;
  /** Undefined for a baseline captured before the consent box existed. */
  whatsappConsent?: boolean;
}

export interface ParentPayload {
  parentId?: number;
  parentName?: string;
  parentPhone?: string;
  parentWhatsappConsent?: boolean;
}

// Builds the parent-related fields for a student create/update request from
// a baseline (the parent last confirmed — via a typeahead selection, or the
// student's existing link) and the currently visible name/phone text.
//
//   unchanged text, known parent -> { parentId }                    relink only
//   changed text,   known parent -> { parentId, parentName, ... }   edit that parent in place
//   changed text,   no parent    -> { parentName, parentPhone }     find-or-create
export function buildParentPayload(
  baseline: ParentBaseline,
  name: string,
  phone: string,
  whatsappConsent?: boolean,
): ParentPayload {
  const trimmedName = name.trim();
  const trimmedPhone = phone.trim();
  const textChanged = trimmedName !== baseline.name || trimmedPhone !== baseline.phone;
  // Sent only when the caller actually has a value AND it differs from what was
  // loaded. Sending it unconditionally would mean every save of every student
  // rewrote the guardian's consent — including saves from a screen that never
  // showed the box — and a consent that is rewritten by unrelated edits is not
  // a record of anything.
  const consentChanged = whatsappConsent !== undefined && whatsappConsent !== baseline.whatsappConsent;

  if (baseline.id && !textChanged) {
    // Relink only — but the consent box can be ticked without touching the name
    // or the number, and that is a real edit that has to travel.
    return consentChanged
      ? { parentId: baseline.id, parentWhatsappConsent: whatsappConsent }
      : { parentId: baseline.id };
  }

  const payload: ParentPayload = { parentName: trimmedName, parentPhone: trimmedPhone };
  if (baseline.id) payload.parentId = baseline.id;
  if (consentChanged) payload.parentWhatsappConsent = whatsappConsent;
  return payload;
}
