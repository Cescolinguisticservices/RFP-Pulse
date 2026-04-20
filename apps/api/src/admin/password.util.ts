import { randomBytes } from 'node:crypto';

/**
 * Generates a human-typable temporary password. Uses a crockford-style
 * alphabet (no 0/O/1/I/L) to minimise copy-paste confusion when an admin
 * reads the one-time password back to the invited user.
 */
export function generateTempPassword(length = 14): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}
