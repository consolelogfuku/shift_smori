import type { StateStorage } from 'zustand/middleware';
import { decryptText, deriveKey, encryptText, newSalt, saltOf, type EncryptedBlob } from './crypto';

const ENC_KEY = 'shift-smori-enc';
const LEGACY_KEY = 'shift-smori';

let key: CryptoKey | null = null;
let salt: Uint8Array | null = null;
let cache: string | null = null;
let writing: Promise<void> = Promise.resolve();

function readBlob(): EncryptedBlob | null {
  try {
    const raw = localStorage.getItem(ENC_KEY);
    if (!raw) return null;
    const b = JSON.parse(raw) as EncryptedBlob;
    return b && b.v === 1 && b.salt && b.iv && b.data ? b : null;
  } catch {
    return null;
  }
}

export function hasEncryptedData(): boolean {
  return readBlob() !== null;
}

/** 旧バージョンが平文で残したデータ (合言葉を決めたら暗号化して取り込む) */
export function legacyPlainData(): string | null {
  try {
    return localStorage.getItem(LEGACY_KEY);
  } catch {
    return null;
  }
}

export function isUnlocked(): boolean {
  return key !== null;
}

/** 合言葉でロック解除。違えば false */
export async function unlock(passphrase: string): Promise<boolean> {
  const blob = readBlob();
  if (!blob) return false;
  const s = saltOf(blob);
  const k = await deriveKey(passphrase, s);
  try {
    cache = await decryptText(k, blob);
  } catch {
    return false;
  }
  key = k;
  salt = s;
  return true;
}

/** 初回: 合言葉を決めて、あれば旧データを取り込む */
export async function setup(passphrase: string): Promise<void> {
  salt = newSalt();
  key = await deriveKey(passphrase, salt);
  cache = legacyPlainData();
  if (cache) {
    localStorage.setItem(ENC_KEY, JSON.stringify(await encryptText(key, salt, cache)));
    localStorage.removeItem(LEGACY_KEY);
  }
}

/** 合言葉の変更 (再暗号化) */
export async function changePassphrase(current: string, next: string): Promise<boolean> {
  const blob = readBlob();
  if (!blob) return false;
  const ok = await deriveKey(current, saltOf(blob))
    .then((k) => decryptText(k, blob))
    .then(() => true)
    .catch(() => false);
  if (!ok) return false;
  salt = newSalt();
  key = await deriveKey(next, salt);
  if (cache !== null) localStorage.setItem(ENC_KEY, JSON.stringify(await encryptText(key, salt, cache)));
  return true;
}

/** ブラウザ内のデータをすべて消す */
export function wipe(): void {
  localStorage.removeItem(ENC_KEY);
  localStorage.removeItem(LEGACY_KEY);
  key = null;
  salt = null;
  cache = null;
}

/** メモリ上の鍵を捨てる (次回は合言葉が必要) */
export function lock(): void {
  key = null;
  salt = null;
  cache = null;
}

/** zustand persist 用。復号済みの内容を返し、書き込みは暗号化して保存 */
export const secureStorage: StateStorage = {
  getItem: () => cache,
  setItem: (_name, value) => {
    cache = value;
    if (!key || !salt) return;
    const k = key;
    const s = salt;
    writing = writing.then(async () => {
      try {
        localStorage.setItem(ENC_KEY, JSON.stringify(await encryptText(k, s, value)));
      } catch {
        /* 容量不足など。次の書き込みで再試行される */
      }
    });
  },
  removeItem: () => {
    cache = null;
    localStorage.removeItem(ENC_KEY);
  },
};

export function flushWrites(): Promise<void> {
  return writing;
}
