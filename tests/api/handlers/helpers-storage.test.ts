import { test } from 'node:test';
import assert from 'node:assert';
import { makeFakeSdk, makeCtx } from '../helpers.ts';

test('makeFakeSdk returns an object with callable storage.upload/delete/getUrl', () => {
  const sdk = makeFakeSdk();
  assert.ok(sdk.storage, 'storage namespace must exist');
  assert.strictEqual(typeof sdk.storage.upload, 'function');
  assert.strictEqual(typeof sdk.storage.delete, 'function');
  assert.strictEqual(typeof sdk.storage.getUrl, 'function');
});

test('makeFakeSdk default storage.upload resolves {url,key,width,height} and records (buf,key,mime)', async () => {
  const sdk = makeFakeSdk();
  const result = await sdk.storage.upload(Buffer.from('abc'), 'products/p1/x.png', 'image/png');
  assert.ok(result.key, 'upload result must have key');
  assert.ok(result.url, 'upload result must have url');
  assert.strictEqual(typeof result.width, 'number');
  assert.strictEqual(typeof result.height, 'number');
  assert.strictEqual(sdk.storage.uploadCalls.length, 1);
  const call = sdk.storage.uploadCalls[0];
  assert.deepStrictEqual(Array.from(call.buf), [97, 98, 99]);
  assert.strictEqual(call.key, 'products/p1/x.png');
  assert.strictEqual(call.mime, 'image/png');
});

test('makeFakeSdk({ storage: { uploadResult } }) returns upload that resolves the provided result', async () => {
  const sdk = makeFakeSdk({
    storage: { uploadResult: { url: '/custom/x', key: 'k', width: 7, height: 8 } },
  });
  const result = await sdk.storage.upload(Buffer.from('z'), 'k', 'image/jpeg');
  assert.strictEqual(result.url, '/custom/x');
  assert.strictEqual(result.width, 7);
  assert.strictEqual(result.height, 8);
});

test('makeFakeSdk({ storage: { uploadThrows } }) returns upload that rejects', async () => {
  const sdk = makeFakeSdk({ storage: { uploadThrows: true } });
  await assert.rejects(() => sdk.storage.upload(Buffer.from('z'), 'k', 'image/png'));
});

test('makeFakeSdk storage.delete records args and resolves; getUrl is pure concat', async () => {
  const sdk = makeFakeSdk();
  await sdk.storage.delete('products/p1/y.jpg');
  assert.deepStrictEqual(sdk.storage.deleteCalls, ['products/p1/y.jpg']);
  assert.strictEqual(sdk.storage.getUrl('products/p1/z.jpg'), '/uploads/products/p1/z.jpg');
});

test('makeCtx({ formData }) yields a request whose formData() gives a File with name and content-type', async () => {
  const ctx = makeCtx({
    formData: { file: Buffer.from('PNGBYTES'), fileName: 'x.png', fileType: 'image/png' },
    params: { id: 'p1' },
  });
  const fd = await ctx.request.formData();
  const file = fd.get('file');
  assert.ok(file, 'file field must be present in formData');
  assert.ok(file instanceof Blob || file instanceof File, 'file must be a Blob/File');
  assert.strictEqual((file as any).name, 'x.png');
  assert.strictEqual((file as any).type, 'image/png');
  const ab = await (file as Blob).arrayBuffer();
  assert.deepStrictEqual(Array.from(new Uint8Array(ab)), [...Buffer.from('PNGBYTES')]);
  // Content-Type must be multipart/form-data with a boundary (platform-set), NOT manual
  const ct = ctx.request.headers.get('content-type') || '';
  assert.match(
    ct,
    /^multipart\/form-data;\s*boundary=/,
    'content-type must be multipart/form-data with boundary'
  );
});

test('makeCtx formData supports extra string fields', async () => {
  const ctx = makeCtx({
    formData: {
      file: Buffer.from('a'),
      fileName: 'y.png',
      fileType: 'image/png',
      fields: { alt: 'desc', sort_order: '2' },
    },
  });
  const fd = await ctx.request.formData();
  assert.strictEqual(fd.get('alt'), 'desc');
  assert.strictEqual(fd.get('sort_order'), '2');
});
