import { parseBackupPayload, type BackupPayload } from './validation';
const encoder = new TextEncoder();
const MAGIC = encoder.encode('HISAAB01');
const ITERATIONS = 600_000;
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const HEADER_BYTES = 36; // magic 8 + salt 16 + IV 12
async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>) {
  if (!password.length) throw new Error('Enter a non-empty backup password.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt']);
}
export async function encryptBackupPayload(payload: BackupPayload, password: string): Promise<ArrayBuffer> {
  const plain = encoder.encode(JSON.stringify(parseBackupPayload(payload)));
  if (plain.byteLength + HEADER_BYTES + 16 > MAX_BACKUP_BYTES) throw new Error('Backup exceeds the 50 MiB limit.');
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const header = new Uint8Array(HEADER_BYTES); header.set(MAGIC); header.set(salt,8); header.set(iv,24);
  const key = await deriveKey(password,salt);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header },key,plain);
  const result = new Uint8Array(header.length + ciphertext.byteLength); result.set(header); result.set(new Uint8Array(ciphertext),header.length);
  return result.buffer;
}
export async function decryptBackupPayload(buffer: ArrayBuffer, password: string): Promise<BackupPayload> {
  if (buffer.byteLength < HEADER_BYTES + 16 || buffer.byteLength > MAX_BACKUP_BYTES) throw new Error('Invalid backup size.');
  const bytes = new Uint8Array(buffer);
  if (!MAGIC.every((b,i) => bytes[i] === b)) throw new Error('Unsupported .hisaab file format.');
  const key = await deriveKey(password,bytes.slice(8,24));
  let plaintext: ArrayBuffer;
  try { plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(24,36), additionalData: bytes.slice(0,36) },key,bytes.slice(36)); }
  catch { throw new Error('Incorrect password or damaged backup. Your data has not been changed.'); }
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
  return parseBackupPayload(value);
}
