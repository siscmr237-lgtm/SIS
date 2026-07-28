export interface ParentBaseline {
  id: number | null;
  name: string;
  phone: string;
}

export interface ParentPayload {
  parentId?: number;
  parentName?: string;
  parentPhone?: string;
}

// Builds the parent-related fields for a student create/update request from
// a baseline (the parent last confirmed — via a typeahead selection, or the
// student's existing link) and the currently visible name/phone text.
//
//   unchanged text, known parent -> { parentId }                    relink only
//   changed text,   known parent -> { parentId, parentName, ... }   edit that parent in place
//   changed text,   no parent    -> { parentName, parentPhone }     find-or-create
export function buildParentPayload(baseline: ParentBaseline, name: string, phone: string): ParentPayload {
  const trimmedName = name.trim();
  const trimmedPhone = phone.trim();
  const textChanged = trimmedName !== baseline.name || trimmedPhone !== baseline.phone;

  if (baseline.id && !textChanged) {
    return { parentId: baseline.id };
  }

  const payload: ParentPayload = { parentName: trimmedName, parentPhone: trimmedPhone };
  if (baseline.id) payload.parentId = baseline.id;
  return payload;
}
