/**
 * CSV helpers (r17 Task 11).
 *
 * `escapeCsvCell` implements RFC 4180 quoting AND defends against spreadsheet
 * formula injection: a cell whose first character is one of `=`, `+`, `-`, `@`,
 * `\t`, or `\r` is prefixed with a single quote so Excel/Sheets/LibreOffice do
 * not evaluate it as a formula. Internal double-quotes are always doubled and
 * the cell is wrapped in double-quotes when it contains a comma, double-quote,
 * newline, or a formula-injection prefix.
 */

/** Characters that trigger a formula-injection escape (leading-char check). */
const FORMULA_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * Escape a single CSV cell value. Accepts strings, numbers, null, undefined.
 * Returns the escaped cell (ready to be joined with `,`).
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);

  const needsQuoting = /["\n\r,]/.test(str);
  const formulaPrefix = str.length > 0 && FORMULA_CHARS.has(str[0]);

  // Double internal double-quotes (RFC 4180).
  let escaped = str.replace(/"/g, '""');

  if (formulaPrefix) {
    // Prepend a single quote to neutralize formula evaluation. The prefix is the
    // primary defense and must be the FIRST character, so the cell is NOT wrapped
    // in outer double-quotes (internal quotes are still doubled).
    return `'${escaped}`;
  }
  if (needsQuoting) {
    return `"${escaped}"`;
  }
  return escaped;
}
