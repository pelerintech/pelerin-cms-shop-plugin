/**
 * Zod schemas for validating locale and currency management payloads.
 *
 * Locales: BCP-47 subset (2-8 lowercase letters with optional subtag)
 * Currencies: 3-letter ISO 4217 code (uppercase)
 * Both require exactly one isDefault: true and all codes unique.
 */
import { z } from 'zod';

/**
 * Base item schema shared by locales and currencies.
 * Code and name validation differ per type.
 */
const BaseItemSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  isDefault: z.boolean(),
});

/**
 * Locale item — code must be BCP-47 subset: 2-8 lowercase letters,
 * optionally followed by a hyphen and 2 uppercase letters (e.g. "en-US").
 */
export const LocaleItemSchema = BaseItemSchema.extend({
  code: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Locale code must be a valid BCP-47 code (e.g. "ro", "en-US")'),
});

/**
 * Currency item — code must be 3-letter ISO 4217 (uppercase).
 */
export const CurrencyItemSchema = BaseItemSchema.extend({
  code: z.string().regex(/^[A-Z]{3}$/, 'Currency code must be a valid 3-letter ISO code (e.g. "RON", "EUR")'),
});

/**
 * Array of locale items. Validates:
 * - All items pass LocaleItemSchema
 * - Array is non-empty
 * - All codes are unique
 * - Exactly one item has isDefault: true
 */
export const LocalesSchema = z.array(LocaleItemSchema).superRefine((items, ctx) => {
  if (items.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one locale is required',
      path: [],
    });
    return;
  }

  // Check unique codes
  const codes = items.map(i => i.code);
  const duplicates = codes.filter((code, index) => codes.indexOf(code) !== index);
  if (duplicates.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Duplicate locale codes: ${[...new Set(duplicates)].join(', ')}`,
      path: [],
    });
  }

  // Check exactly one default
  const defaults = items.filter(i => i.isDefault);
  if (defaults.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Exactly one locale must be set as default',
      path: [],
    });
  } else if (defaults.length > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Only one locale can be set as default',
      path: [],
    });
  }
});

/**
 * Array of currency items. Validates:
 * - All items pass CurrencyItemSchema
 * - Array is non-empty
 * - All codes are unique
 * - Exactly one item has isDefault: true
 */
export const CurrenciesSchema = z.array(CurrencyItemSchema).superRefine((items, ctx) => {
  if (items.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one currency is required',
      path: [],
    });
    return;
  }

  // Check unique codes
  const codes = items.map(i => i.code);
  const duplicates = codes.filter((code, index) => codes.indexOf(code) !== index);
  if (duplicates.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Duplicate currency codes: ${[...new Set(duplicates)].join(', ')}`,
      path: [],
    });
  }

  // Check exactly one default
  const defaults = items.filter(i => i.isDefault);
  if (defaults.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Exactly one currency must be set as default',
      path: [],
    });
  } else if (defaults.length > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Only one currency can be set as default',
      path: [],
    });
  }
});

export type LocaleItem = z.infer<typeof LocaleItemSchema>;
export type CurrencyItem = z.infer<typeof CurrencyItemSchema>;
