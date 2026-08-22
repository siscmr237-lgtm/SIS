/**
 * One "Full Name" box in the forms, two columns in the database.
 *
 * Students and staff are stored as firstName + lastName and read back that way
 * by everything downstream — report cards, rankings, the PDF generator, the
 * ledger, class lists. This is the seam between the two: forms collect one
 * string, these functions convert at the edge, and the API contract does not
 * move at all.
 */

export interface SplitName {
  firstName: string;
  lastName: string;
}

/**
 * Splits at the FIRST space, so the first word is the given name and everything
 * after it is the surname: "Jean Paul Mbarga" -> "Jean" + "Paul Mbarga".
 *
 * That direction is not arbitrary. firstName is used on its own all over the
 * app as the familiar name — "Someone authorised to pick up Jean", "Jean has
 * fully paid" — so the first word has to be the one that lands there. Taking
 * the LAST word as the surname instead would put "Mbarga" in firstName's place
 * and read as the wrong person.
 *
 * It also round-trips: joinFullName(splitFullName(x)) returns x with its
 * whitespace tidied and nothing else changed. Since every display in the app is
 * some form of `${firstName} ${lastName}`, what someone types is what they see
 * back, which is the property that makes the single box safe to introduce over
 * data that was entered as two.
 *
 * Runs of whitespace collapse to one space, so a stray double space or a name
 * pasted with a newline in it does not become part of the stored value.
 */
export function splitFullName(fullName: string): SplitName {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/** The inverse, for seeding a form from a record that is already stored split. */
export function joinFullName(firstName?: string | null, lastName?: string | null): string {
  return [firstName, lastName]
    .map((p) => String(p ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Whether the box holds enough to save: at least two words.
 *
 * This is the same bar the two separate required fields set — both had to be
 * non-empty — kept deliberately rather than relaxed. Accepting one word would
 * start writing empty lastName values into columns that have never held one,
 * which is a data change, not a form change, and nobody asked for it. Someone
 * who genuinely has a single name can still be entered by whoever decides what
 * the second word should be, exactly as before.
 */
export function isCompleteFullName(fullName: string): boolean {
  const { firstName, lastName } = splitFullName(fullName);
  return Boolean(firstName && lastName);
}
