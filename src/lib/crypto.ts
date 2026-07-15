/**
 * Encryption utilities matching the CMS crypto module.
 * Uses AES-256-GCM via Node's built-in crypto.
 */
import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

function getEncryptionKey(): Buffer {
  const dedicated =
    (import.meta as any).env?.WEBHOOK_ENCRYPTION_KEY ?? process.env.WEBHOOK_ENCRYPTION_KEY;

  if (dedicated) return deriveKey(dedicated);

  const fallback = (import.meta as any).env?.BETTER_AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET;

  if (fallback) return deriveKey(fallback);

  throw new Error(
    '[crypto] No encryption key available. Set WEBHOOK_ENCRYPTION_KEY or BETTER_AUTH_SECRET.'
  );
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv) as crypto.CipherGCM;

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decrypt(value: string): string {
  const parts = value.split(':');
  if (parts.length !== 3) {
    throw new Error('[crypto] Invalid ciphertext format');
  }

  const [ivHex, authTagHex, ctHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ct = Buffer.from(ctHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv) as crypto.DecipherGCM;
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

const ENCRYPTED_PATTERN = /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i;

export function isEncrypted(value: string): boolean {
  return ENCRYPTED_PATTERN.test(value);
}

export function decryptIfNeeded(value: string): string {
  return isEncrypted(value) ? decrypt(value) : value;
}
