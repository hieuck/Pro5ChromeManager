import crypto from 'crypto';
import os from 'os';

// ─── Machine ID ────────────────────────────────────────────────────────────────

export function getMachineId(): string {
  const hostname = os.hostname();
  const cpuModel = os.cpus()[0]?.model ?? 'unknown-cpu';
  return `${hostname}::${cpuModel}`;
}

/** Derive a 32-byte AES key from machine ID using SHA-256 */
function deriveKey(): Buffer {
  const seed = getMachineId();
  return crypto.createHash('sha256').update(seed, 'utf-8').digest();
}

// ─── AES-256-GCM encrypt/decrypt ───────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96-bit IV recommended for GCM
const TAG_LENGTH = 16;  // 128-bit auth tag

/**
 * Encrypt plaintext with AES-256-GCM.
 * Returns base64-encoded string: iv(12) + authTag(16) + ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: iv | authTag | ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString('base64');
}

/**
 * Decrypt a base64-encoded AES-256-GCM ciphertext produced by `encrypt()`.
 * Returns the original plaintext string.
 */
export function decrypt(encoded: string): string {
  const key = deriveKey();
  const packed = Buffer.from(encoded, 'base64');

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString('utf-8');
}
