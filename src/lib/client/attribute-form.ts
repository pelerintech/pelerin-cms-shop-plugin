/**
 * Pure, DOM-free attribute-form logic for the admin attribute pages.
 *
 * Extracted from the (previously `is:inline`) client scripts of
 * `src/pages/admin/settings/attributes/new.astro` and `[id].astro` so the code
 * is unit-testable and lives in a bundled module (where Astro strips TS — the
 * `is:inline` TS-trap this module replaces). See shop-r34.
 *
 * Every function is a pure transform over a plain `Record<string, string>` of
 * form fields; nothing here touches the DOM, `fetch`, or `window`.
 */

export interface AttributeSaveOptions {
  defaultLocale: string;
  otherLocaleCodes: string[];
}

export interface AttributeSavePayload {
  name: string;
  type: string;
  sort_order: number;
  translations: Record<string, string>;
}

/** Coerce a sort-order form value to an integer, defaulting to 0. */
function toInt(value: string | undefined): number {
  return parseInt(value ?? '', 10) || 0;
}

/**
 * Build the POST body for creating a global attribute. `name` is the
 * default-locale name; `name_{code}` fields for each other locale become the
 * `translations` map (empty values omitted).
 */
export function buildAttributeSavePayload(
  fields: Record<string, string>,
  opts: AttributeSaveOptions
): AttributeSavePayload {
  const translations: Record<string, string> = Object.fromEntries(
    opts.otherLocaleCodes
      .filter((code) => (fields[`name_${code}`] ?? '').trim() !== '')
      .map((code) => [code, fields[`name_${code}`] ?? ''])
  );
  return {
    name: fields.name ?? '',
    type: fields.type ?? '',
    sort_order: toInt(fields.sort_order),
    translations,
  };
}

/**
 * Build the PUT body for updating an attribute. Mirrors the edit form's
 * existing behavior: the `type` key is intentionally excluded (type is not
 * editable on the edit page), `sort_order` is parsed, and per-locale name
 * fields are passed through as-is.
 */
export function buildAttributeUpdatePayload(
  fields: Record<string, string>
): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([key]) => key !== 'type')
      .map(([key, value]) => [key, key === 'sort_order' ? toInt(value) : value])
  ) as Record<string, string | number>;
}

export interface AttributeOptionPayload {
  value: string;
  label?: string;
  sort_order: number;
}

/** Build the POST body for adding an option to a select-type attribute. */
export function buildAttributeOptionPayload(
  fields: Record<string, string>
): AttributeOptionPayload {
  const out: AttributeOptionPayload = {
    value: fields.value ?? '',
    sort_order: toInt(fields.sort_order),
  };
  if (fields.label) out.label = fields.label;
  return out;
}

export interface AttributeFormResult {
  ok: boolean;
  /** Id to redirect to on success (the created/edited attribute id). */
  redirectId: string | null;
  errorMessage: string | null;
  fieldErrors: Record<string, string>;
}

/** Interpret a `{ success, error, fields, data }` API response for the forms. */
export function attributeFormResponse(data: {
  success: boolean;
  error?: string;
  fields?: Record<string, string>;
  data?: { id?: string };
}): AttributeFormResult {
  if (data.success) {
    return {
      ok: true,
      redirectId: data.data?.id ?? null,
      errorMessage: null,
      fieldErrors: {},
    };
  }
  return {
    ok: false,
    redirectId: null,
    errorMessage: data.error || 'Unknown error',
    fieldErrors: data.fields || {},
  };
}
