/**
 * "Done by [Name]" — who recorded the thing you are looking at.
 *
 * The name comes from the record itself (createdByName), captured at the moment
 * it was written, NOT from a live join against the account. That is what makes
 * it survive the person being removed from the school, and it is why an old
 * record keeps naming whoever actually did the work rather than silently
 * re-attributing itself later.
 *
 * RENDERS NOTHING when there is no name, and that is the important case: every
 * record written before attribution existed has none, and "Done by —" would be a
 * dash pretending to be an answer. Silence reads correctly as "not recorded".
 *
 * INLINE STYLES THROUGHOUT. src/index.css is a frozen, pre-compiled Tailwind
 * build — a utility class that is not already in it renders as nothing at all —
 * so anything new in this codebase styles itself inline.
 */
export function DoneBy({
  name,
  variant = "block",
  style,
}: {
  name?: string | null;
  /**
   * "block"  a footer under a card or dialog, with its own hairline rule above.
   * "inline" a quiet second line inside a table cell or list row, no rule.
   */
  variant?: "block" | "inline";
  style?: React.CSSProperties;
}) {
  const label = typeof name === "string" ? name.trim() : "";
  if (!label) return null;

  const base: React.CSSProperties =
    variant === "block"
      ? {
          marginTop: "1rem",
          paddingTop: "0.75rem",
          borderTop: "1px solid #F1F5F9",
          fontSize: "0.75rem",
          color: "#94A3B8",
        }
      : {
          marginTop: 2,
          fontSize: "0.6875rem",
          color: "#94A3B8",
        };

  return <p style={{ ...base, ...style }}>Done by {label}</p>;
}
