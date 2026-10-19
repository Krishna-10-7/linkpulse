import { customAlphabet } from 'nanoid';

// Base62: 62^7 ≈ 3.5 trillion codes at the default length.
export const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const DEFAULT_CODE_LENGTH = 7;

const generators = new Map();

/** Cryptographically random Base62 code (nanoid uses crypto.getRandomValues). */
export function randomCode(length = DEFAULT_CODE_LENGTH) {
  if (!generators.has(length)) generators.set(length, customAlphabet(BASE62, length));
  return generators.get(length)();
}

/**
 * Generate a code that is not taken.
 * `isTaken(codeLower)` is checked first; the database unique index is the final guard,
 * so callers should still retry on a unique-constraint error.
 * After `attempts` collisions at one length, the code grows by one character.
 */
export async function generateUniqueCode(isTaken, { length = DEFAULT_CODE_LENGTH, attempts = 5, isReserved = () => false } = {}) {
  for (let len = length; len < length + 3; len++) {
    for (let i = 0; i < attempts; i++) {
      const code = randomCode(len);
      if (isReserved(code)) continue;
      if (!(await isTaken(code.toLowerCase()))) return code;
    }
  }
  throw new Error('Could not generate a unique short code');
}
