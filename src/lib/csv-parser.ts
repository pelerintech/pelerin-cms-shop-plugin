/**
 * Simple CSV → array-of-objects parser.
 *
 * Phase-1: no quoted-field support. The import template format avoids commas in
 * field values (documented constraint in the request design). If CSV complexity
 * grows (quoted fields, embedded commas), replace with a minimal CSV library.
 *
 * Behaviour:
 *  - First non-empty line is the header row.
 *  - Each subsequent non-empty line is a data row.
 *  - Values are split on commas; whitespace around values and headers is trimmed.
 *  - Empty lines are ignored.
 *  - Header-only input → empty array.
 *  - A row with fewer values than headers: missing trailing values become ''.
 *  - A row with more values than headers: extra values are dropped.
 */
export function parseCSV(text: string): Record<string, string>[] {
  if (!text) return [];
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const row: Record<string, string> = {};
    for (let h = 0; h < headers.length; h++) {
      row[headers[h]] = (values[h] ?? '').trim();
    }
    rows.push(row);
  }

  return rows;
}
