/**
 * Structural stand-in for a thrown value's commonly-read fields.
 *
 * (r37) Catch-clause variables may only be typed `any` or `unknown` (TS1196),
 * so we keep the catch binding as `unknown` and read fields through
 * `errorFields`, which casts to this shape (and returns `{}` for non-objects).
 * A type assertion never alters runtime, so this reproduces reading
 * `err.message` / `err.status` on the old `any` binding with zero behavior
 * change — while giving the caught value a real, documented shape instead of
 * `any`.
 */
export type ErrorLike = {
  message?: string;
  status?: number;
  code?: string;
  [key: string]: unknown;
};

/**
 * Return the caught value narrowed to `ErrorLike`. A caught value can be
 * anything (a thrown string/number/undefined or a non-`Error` object), so this
 * returns the object shape for the caller to read `.message`/`.status` off of;
 * missing fields read as `undefined`, matching how the former `any` binding
 * behaved. Because the return type is the plain object shape (not a
 * `| undefined` union), callers can navigate props without optional-chaining.
 */
export function errorFields(err: unknown): ErrorLike {
  if (typeof err === 'object' && err !== null) return err as ErrorLike;
  return {};
}
