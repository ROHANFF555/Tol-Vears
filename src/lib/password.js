// Password generation + strength logic — pure functions, shared by the UI and scripts/smoke.mjs.

export const CHAR_SETS = {
  upper: { label: 'Uppercase (A–Z)', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
  lower: { label: 'Lowercase (a–z)', chars: 'abcdefghijklmnopqrstuvwxyz' },
  numbers: { label: 'Numbers (0–9)', chars: '0123456789' },
  symbols: { label: 'Symbols (!@#$…)', chars: '!@#$%^&*()_+-=[]{};:,.<>?' },
};

export function buildPool(options) {
  return Object.keys(CHAR_SETS)
    .filter((key) => options[key])
    .map((key) => CHAR_SETS[key].chars)
    .join('');
}

// Cryptographically secure randomness with rejection sampling to avoid modulo bias.
export function generatePassword(length, pool) {
  if (!pool || pool.length === 0 || !Number.isInteger(length) || length < 1) return '';
  const out = new Uint32Array(length);
  const limit = Math.floor(0x100000000 / pool.length) * pool.length;
  const buf = new Uint32Array(length);
  let filled = 0;
  while (filled < length) {
    crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && filled < length; i++) {
      if (buf[i] < limit) out[filled++] = buf[i] % pool.length;
    }
  }
  let password = '';
  for (let i = 0; i < length; i++) password += pool[out[i]];
  return password;
}

export function passwordStrength(length, poolSize) {
  if (!poolSize || !length) return { level: 0, label: 'No characters selected', bits: 0 };
  const bits = length * Math.log2(poolSize);
  if (bits < 45) return { level: 1, label: 'Weak', bits };
  if (bits < 70) return { level: 2, label: 'Medium', bits };
  return { level: 3, label: 'Strong', bits };
}
