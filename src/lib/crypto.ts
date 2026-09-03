/** 合言葉でブラウザ内のデータを暗号化する (AES-GCM 256, PBKDF2-SHA256) */

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface EncryptedBlob {
  v: 1;
  salt: string;
  iv: string;
  data: string;
}

export const PBKDF2_ITERATIONS = 250_000;

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export function newSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

export async function encryptText(key: CryptoKey, salt: Uint8Array, text: string): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  return { v: 1, salt: toB64(salt), iv: toB64(iv), data: toB64(data) };
}

/** 合言葉が違うと例外を投げる */
export async function decryptText(key: CryptoKey, blob: EncryptedBlob): Promise<string> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(blob.iv) as BufferSource }, key, fromB64(blob.data) as BufferSource);
  return dec.decode(plain);
}

export function saltOf(blob: EncryptedBlob): Uint8Array {
  return fromB64(blob.salt);
}
