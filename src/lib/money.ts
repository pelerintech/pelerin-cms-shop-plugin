/**
 * Money-unit conversion helpers.
 *
 * The shop stores, computes, and serves all money in MINOR units (bani/cents,
 * integer). Major units (e.g. "50.00 RON") appear ONLY at human-facing
 * boundaries: the admin UI (form input + display) and the bulk-import source.
 * This module is the single place major↔minor conversion lives, so no seam
 * can diverge. Math.round prevents float drift on major→minor.
 */
export function majorToMinor(amount: number | string): number {
  return Math.round(Number(amount) * 100);
}

export function minorToMajor(amount: number): number {
  return Number(amount) / 100;
}

/** Format a minor-unit amount for display as major with 2 decimals. */
export function formatMinor(amount: number, currency: string): string {
  return `${minorToMajor(amount).toFixed(2)} ${currency}`;
}
