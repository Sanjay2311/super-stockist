/** Hand-rolled CSV writer — replaces the `xlsx` (SheetJS) package for the report
 *  CSV export route. Two things `xlsx`'s `json_to_sheet`/`sheet_to_csv` pair did NOT
 *  do that this does: (1) neutralize a leading `=`/`+`/`-`/`@` (spreadsheet-formula
 *  injection — several exported fields are user-entered text: distributor/employee/
 *  lead names), and (2) drop a dependency carrying unfixed high-severity advisories.
 *  Standard CSV escaping: fields containing a comma/quote/newline are quoted, with
 *  internal quotes doubled. */

const NEEDS_QUOTING = /[",\n\r]/;
const FORMULA_PREFIX = /^[=+\-@]/;

function escapeCsvField(raw: unknown): string {
  let s = raw == null ? '' : String(raw);
  if (FORMULA_PREFIX.test(s)) s = `'${s}`;
  if (NEEDS_QUOTING.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Renders an array of flat row objects as CSV text (header + data rows, CRLF line
 *  endings). The header is the union of every row's keys, in order of first
 *  appearance — rows need not share an identical key set. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) { seen.add(key); headers.push(key); }
    }
  }
  const lines = [headers.map(escapeCsvField).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvField(row[h])).join(','));
  }
  return lines.join('\r\n');
}
