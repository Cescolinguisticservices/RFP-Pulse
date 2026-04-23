import { randomBytes } from 'node:crypto';

/**
 * Generates a human-typable temporary password. Uses a crockford-style
 * alphabet (no 0/O/1/I/L) to minimise copy-paste confusion when an admin
 * reads the one-time password back to the invited user.
 */
export function generateTempPassword(length = 14): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const maxUnbiased = 256 - (256 % alphabet.length);
  let out = '';
  while (out.length < length) {
    const buf = randomBytes(length);
    for (let i = 0; i < buf.length && out.length < length; i += 1) {
      const b = buf[i];
      if (b < maxUnbiased) {
        out += alphabet[b % alphabet.length];
      }
    }
  }
  return out;
}
