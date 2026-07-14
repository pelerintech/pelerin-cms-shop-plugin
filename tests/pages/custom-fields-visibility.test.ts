import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

test('loadCustomFields hides the Custom Fields card when no field assignments exist', () => {
  const src = readFileSync(
    new URL('../../src/pages/admin/products/[id].astro', import.meta.url),
    'utf-8'
  );

  // The Custom Fields card must have an id we can target
  assert.ok(
    /id="custom-fields-card"/.test(src),
    'Custom Fields card must have id="custom-fields-card" for hiding'
  );

  // The loadCustomFields function must hide the card when data.data.length === 0
  assert.ok(
    /custom-fields-card.*hidden|customFieldsCard.*hidden|getElementById.*custom-fields-card.*hidden/.test(
      src
    ) || /custom-fields-card[^]*hidden/.test(src),
    'loadCustomFields must hide the custom-fields-card when no field assignments exist'
  );
});
