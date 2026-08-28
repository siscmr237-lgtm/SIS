/**
 * The loader that stands in for ONE region of a page while that region's data
 * is on its way, leaving the rest of the screen alone.
 *
 * WHERE IT GOES. Around the part of a screen that cannot be drawn without the
 * server: the rows of a table, the figures on a stat card, the body of a dialog
 * that opens onto a record. Never around a heading, a menu, a column heading, a
 * search box, a filter or a button -- all of those are known the moment the
 * component renders and must appear straight away, so that a page keeps its
 * shape while it fills in.
 *
 * The rule of thumb when adding one: if you can write the markup without
 * reading anything the API returned, it is structure and must not be inside a
 * loader.
 *
 * The styles live in src/components/ui/loaderCss.ts and are mounted once by
 * app/layout.tsx; this file is markup only. See that file for why.
 */

interface ContentLoaderProps {
  /**
   * How much vertical room the loader takes, and therefore what it is centred
   * within. The 180px default suits a table body or a card. Pass something
   * smaller for a short strip -- a single figure on a tile -- so the spinner
   * does not push the layout around while it runs, and something larger for a
   * region that will end up tall, so the page does not jump when it fills.
   */
  minHeight?: number | string;
  /**
   * Overridable only where a region needs to say something more specific than
   * the default. Kept as one wording everywhere else on purpose: the same thing
   * is happening in each of these places, and three variations on "loading"
   * across one screen just reads as inconsistency.
   */
  label?: string;
}

export function ContentLoader({ minHeight, label = 'Loading Contents' }: ContentLoaderProps) {
  return (
    // role="status" with a polite live region: a screen reader hears that this
    // part of the page is loading, and hears it again -- correctly -- for each
    // region, rather than once for the whole screen.
    <div
      data-sis-loader=""
      role="status"
      aria-live="polite"
      style={minHeight === undefined ? undefined : { minHeight }}
    >
      {/* aria-hidden: the ring is the visual half of a message the text
          underneath already carries in full. */}
      <div data-sis-loader-spinner="" aria-hidden="true" />
      <p data-sis-loader-text="">{label}</p>
    </div>
  );
}

/**
 * The spinner on its own, sized to stand in for a single VALUE rather than a
 * region -- the figure on a stat tile, a total in a summary line.
 *
 * No text with it, deliberately. "Loading Contents" under a number that is
 * about to be four characters wide would be wider than the card and would say
 * less than the spinner already does. The label is right for an area a reader
 * has to be told about; a figure that is visibly not there yet is not one.
 *
 * It reserves roughly the height of the figure it replaces, so the tile does
 * not resize when the number lands.
 */
export function ValueLoader({ size = 22 }: { size?: number }) {
  return (
    <span
      data-sis-loader-inline=""
      role="status"
      aria-label="Loading"
      style={{ width: size, height: size }}
    />
  );
}

interface TableLoaderProps extends ContentLoaderProps {
  /**
   * How many columns the table has. The cell has to span all of them or the
   * loader sits under the first column instead of across the table, which is
   * the whole point -- it must be centred in the area the ROWS will occupy,
   * directly under the headings, which stay on screen throughout.
   */
  colSpan: number;
}

/**
 * The same loader, shaped to sit inside a <Table> in place of its rows.
 *
 * Plain <tr>/<td> rather than the kit's TableRow/TableCell: those carry a
 * bottom border and a hover highlight, both of which are right for a row of
 * data and wrong for this -- a hover state on a spinner invites a click that
 * does nothing. The padding is zeroed because ContentLoader brings its own.
 */
export function TableLoader({ colSpan, minHeight, label }: TableLoaderProps) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0 }}>
        <ContentLoader minHeight={minHeight} label={label} />
      </td>
    </tr>
  );
}
