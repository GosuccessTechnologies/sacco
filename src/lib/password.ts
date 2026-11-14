// ============================================================================
// Password hashing — scrypt (no native deps). DEVELOPER_GUIDE.md §5.1
// Format: scrypt$N$r$p$saltB64$hashB64
// ============================================================================
import crypto from 'node:crypto';

const N = 16384, r = 8, p = 1, KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEYLEN, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [algo, nS, rS, pS, saltB64, hashB64] = stored.split('$');
    if (algo !== 'scrypt') return false;
    const hash = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), KEYLEN, {
      N: parseInt(nS, 10), r: parseInt(rS, 10), p: parseInt(pS, 10),
    });
    const expected = Buffer.from(hashB64, 'base64');
    return crypto.timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
}
