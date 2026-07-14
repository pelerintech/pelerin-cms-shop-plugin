/**
 * Tier 1 tests for locales/currencies management accessors.
 *
 * Tests getLocales(), getCurrencies(), saveLocales(), saveCurrencies()
 * and verifies getShopConfig() derives defaultLocale/defaultCurrency
 * from the isDefault flag with fallback to old default_locale key.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { createTestDb, resetDb, insertFixture, shop_settings } from '../../db/harness.ts';
import {
  getLocales,
  getCurrencies,
  saveLocales,
  saveCurrencies,
  getShopConfig,
} from '../../../src/lib/data/settings.ts';

// ----------------------------------------------------------------
// getLocales
// ----------------------------------------------------------------

test('getLocales returns populated array', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await resetDb(db);
    await insertFixture(db, 'shop_settings', {
      id: crypto.randomUUID(),
      key: 'locales',
      value: JSON.stringify([
        { code: 'ro', name: 'Română', isDefault: true },
        { code: 'en', name: 'English', isDefault: false },
      ]),
    });

    const locales = await getLocales(db);
    assert.strictEqual(locales.length, 2);
    assert.strictEqual(locales[0].code, 'ro');
    assert.strictEqual(locales[0].name, 'Română');
    assert.strictEqual(locales[0].isDefault, true);
    assert.strictEqual(locales[1].code, 'en');
  } finally {
    await cleanup();
  }
});

test('getLocales returns empty array when not set', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await resetDb(db);
    const locales = await getLocales(db);
    assert.strictEqual(locales.length, 0);
  } finally {
    await cleanup();
  }
});

test('getLocales returns empty array for empty JSON', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await resetDb(db);
    await insertFixture(db, 'shop_settings', {
      id: crypto.randomUUID(),
      key: 'locales',
      value: '[]',
    });

    const locales = await getLocales(db);
    assert.strictEqual(locales.length, 0);
  } finally {
    await cleanup();
  }
});

// ----------------------------------------------------------------
// getCurrencies
// ----------------------------------------------------------------

test('getCurrencies returns populated array', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await resetDb(db);
    await insertFixture(db, 'shop_settings', {
      id: crypto.randomUUID(),
      key: 'currencies',
      value: JSON.stringify([
        { code: 'RON', name: 'Leu românesc', isDefault: true },
        { code: 'EUR', name: 'Euro', isDefault: false },
      ]),
    });

    const currencies = await getCurrencies(db);
    assert.strictEqual(currencies.length, 2);
    assert.strictEqual(currencies[0].code, 'RON');
    assert.strictEqual(currencies[0].name, 'Leu românesc');
    assert.strictEqual(currencies[0].isDefault, true);
    assert.strictEqual(currencies[1].code, 'EUR');
  } finally {
    await cleanup();
  }
});

test('getCurrencies returns empty array when not set', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await resetDb(db);
    const currencies = await getCurrencies(db);
    assert.strictEqual(currencies.length, 0);
  } finally {
    await cleanup();
  }
});

// ----------------------------------------------------------------
// saveLocales
// ----------------------------------------------------------------

test('saveLocales persists JSON blob and getLocales reads it back', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await resetDb(db);
    const newLocales = [
      { code: 'ro', name: 'Română', isDefault: true },
      { code: 'bg', name: 'Български', isDefault: false },
    ];
    await saveLocales(db, newLocales);

    const locales = await getLocales(db);
    assert.strictEqual(locales.length, 2);
    assert.strictEqual(locales[0].code, 'ro');
    assert.strictEqual(locales[0].isDefault, true);
    assert.strictEqual(locales[1].code, 'bg');
    assert.strictEqual(locales[1].isDefault, false);
  } finally {
    await cleanup();
  }
});

test('saveLocales upserts existing key', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await resetDb(db);
    // Insert old locales
    await insertFixture(db, 'shop_settings', {
      id: crypto.randomUUID(),
      key: 'locales',
      value: JSON.stringify([{ code: 'ro', name: 'Română', isDefault: true }]),
    });

    // Save new locales (should upsert, not duplicate)
    const newLocales = [
      { code: 'ro', name: 'Română', isDefault: true },
      { code: 'en', name: 'English', isDefault: false },
      { code: 'bg', name: 'Български', isDefault: false },
    ];
    await saveLocales(db, newLocales);

    const locales = await getLocales(db);
    assert.strictEqual(locales.length, 3);

    // Verify only one 'locales' row exists in settings
    const raw = await import('../../../src/lib/data/settings.ts');
    const row = await raw.getSetting(db, 'locales');
    assert.ok(row !== null, 'locales setting must exist');
    const parsed = JSON.parse(row);
    assert.strictEqual(parsed.length, 3);
  } finally {
    await cleanup();
  }
});

// ----------------------------------------------------------------
// saveCurrencies
// ----------------------------------------------------------------

test('saveCurrencies persists JSON blob and getCurrencies reads it back', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await resetDb(db);
    const newCurrencies = [
      { code: 'RON', name: 'Leu românesc', isDefault: true },
      { code: 'USD', name: 'US Dollar', isDefault: false },
    ];
    await saveCurrencies(db, newCurrencies);

    const currencies = await getCurrencies(db);
    assert.strictEqual(currencies.length, 2);
    assert.strictEqual(currencies[0].code, 'RON');
    assert.strictEqual(currencies[0].isDefault, true);
    assert.strictEqual(currencies[1].code, 'USD');
    assert.strictEqual(currencies[1].isDefault, false);
  } finally {
    await cleanup();
  }
});

// ----------------------------------------------------------------
// getShopConfig derives default from isDefault flag
// ----------------------------------------------------------------

test('getShopConfig derives defaultLocale from isDefault flag', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await resetDb(db);
    await insertFixture(db, 'shop_settings', {
      id: crypto.randomUUID(),
      key: 'locales',
      value: JSON.stringify([
        { code: 'ro', name: 'Română', isDefault: false },
        { code: 'en', name: 'English', isDefault: true },
      ]),
    });
    await insertFixture(db, 'shop_settings', {
      id: crypto.randomUUID(),
      key: 'currencies',
      value: JSON.stringify([{ code: 'RON', name: 'Leu românesc', isDefault: true }]),
    });

    const config = await getShopConfig(db);
    assert.strictEqual(config.defaultLocale, 'en');
    assert.strictEqual(config.defaultCurrency, 'RON');
  } finally {
    await cleanup();
  }
});

test('getShopConfig derives defaultCurrency from isDefault flag', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await resetDb(db);
    await insertFixture(db, 'shop_settings', {
      id: crypto.randomUUID(),
      key: 'locales',
      value: JSON.stringify([{ code: 'ro', name: 'Română', isDefault: true }]),
    });
    await insertFixture(db, 'shop_settings', {
      id: crypto.randomUUID(),
      key: 'currencies',
      value: JSON.stringify([
        { code: 'RON', name: 'Leu românesc', isDefault: false },
        { code: 'EUR', name: 'Euro', isDefault: true },
      ]),
    });

    const config = await getShopConfig(db);
    assert.strictEqual(config.defaultLocale, 'ro');
    assert.strictEqual(config.defaultCurrency, 'EUR');
  } finally {
    await cleanup();
  }
});

test('getShopConfig falls back to default_locale key when locales is empty', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await resetDb(db);
    await insertFixture(db, 'shop_settings', {
      id: crypto.randomUUID(),
      key: 'locales',
      value: '[]',
    });
    await insertFixture(db, 'shop_settings', {
      id: crypto.randomUUID(),
      key: 'default_locale',
      value: 'ro',
    });
    await insertFixture(db, 'shop_settings', {
      id: crypto.randomUUID(),
      key: 'currencies',
      value: '[]',
    });

    const config = await getShopConfig(db);
    assert.strictEqual(config.defaultLocale, 'ro');
  } finally {
    await cleanup();
  }
});

test('getShopConfig falls back to default_currency key when currencies is empty', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await resetDb(db);
    await insertFixture(db, 'shop_settings', {
      id: crypto.randomUUID(),
      key: 'locales',
      value: '[]',
    });
    await insertFixture(db, 'shop_settings', {
      id: crypto.randomUUID(),
      key: 'currencies',
      value: '[]',
    });
    await insertFixture(db, 'shop_settings', {
      id: crypto.randomUUID(),
      key: 'default_currency',
      value: 'RON',
    });

    const config = await getShopConfig(db);
    assert.strictEqual(config.defaultCurrency, 'RON');
  } finally {
    await cleanup();
  }
});

test('getShopConfig handles empty locales array (returns fallback)', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await resetDb(db);
    // No settings at all
    const config = await getShopConfig(db);
    assert.ok(typeof config.defaultLocale === 'string', 'defaultLocale must be a string');
    assert.ok(typeof config.defaultCurrency === 'string', 'defaultCurrency must be a string');
  } finally {
    await cleanup();
  }
});

test('getShopConfig handles completely empty database', async () => {
  const { db, cleanup } = await createTestDb();
  try {
    await resetDb(db);
    const config = await getShopConfig(db);
    assert.strictEqual(config.locales.length, 0);
    assert.strictEqual(config.currencies.length, 0);
    assert.ok(
      typeof config.defaultLocale === 'string',
      'defaultLocale must be a string even with no data'
    );
    assert.ok(
      typeof config.defaultCurrency === 'string',
      'defaultCurrency must be a string even with no data'
    );
    assert.ok(typeof config.raw === 'object', 'raw must be an object');
  } finally {
    await cleanup();
  }
});
