// Independent verification logic — deliberately a *copy* of the rules ToolsHub implements,
// not an import from the site. That is the whole point: the MCP server re-derives the expected
// answer itself so it can tell Claude when the live page disagrees with the math.
//
// Keep in sync with:
//   Tol-Vears/src/lib/password.js   (CHAR_SETS, strength thresholds)
//   Tol-Vears/src/lib/converters.js (unit factors, temperature conversion)

/* ------------------------------------------------------------------ passwords */

export const CHAR_SETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{};:,.<>?',
};

/** Map the tool's input option names onto CHAR_SETS keys (accepts a few aliases). */
const OPTION_ALIASES = {
  uppercase: 'uppercase',
  upper: 'uppercase',
  uppercaseLetters: 'uppercase',
  lowercase: 'lowercase',
  lower: 'lowercase',
  lowercaseLetters: 'lowercase',
  numbers: 'numbers',
  digits: 'numbers',
  numeric: 'numbers',
  symbols: 'symbols',
  special: 'symbols',
  specialCharacters: 'symbols',
  punctuation: 'symbols',
};

export const OPTION_KEYS = Object.keys(CHAR_SETS);

export function normalizeOptions(input = {}) {
  const out = {};
  for (const key of OPTION_KEYS) out[key] = true; // every character type on by default
  for (const [raw, value] of Object.entries(input)) {
    const key = OPTION_ALIASES[raw] || OPTION_ALIASES[String(raw).toLowerCase()];
    if (key) out[key] = Boolean(value);
  }
  return out;
}

export function poolSizeFor(options) {
  return OPTION_KEYS.filter((k) => options[k]).reduce((sum, k) => sum + CHAR_SETS[k].length, 0);
}

/** Which of the four character classes actually appear in a password. */
export function detectCharTypes(password) {
  const found = {};
  for (const key of OPTION_KEYS) {
    const chars = CHAR_SETS[key];
    found[key] = [...String(password ?? '')].some((c) => chars.includes(c));
  }
  return found;
}

/** Entropy in bits, and the Weak/Medium/Strong label ToolsHub derives from it. */
export function strengthFor(length, poolSize) {
  if (!poolSize || !length) return { level: 0, label: 'No characters selected', bits: 0 };
  const bits = length * Math.log2(poolSize);
  if (bits < 45) return { level: 1, label: 'Weak', bits };
  if (bits < 70) return { level: 2, label: 'Medium', bits };
  return { level: 3, label: 'Strong', bits };
}

/**
 * Full independent check of a generated password.
 * Note: a random password is NOT guaranteed to contain every requested class, so a missing
 * class is reported as an observation, not automatically a failure.
 */
export function verifyPassword({ password, requestedLength, options }) {
  const pw = String(password ?? '');
  const found = detectCharTypes(pw);
  const poolSize = poolSizeFor(options);
  const expected = strengthFor(requestedLength, poolSize);

  const requested = OPTION_KEYS.filter((k) => options[k]);
  const missingRequested = requested.filter((k) => !found[k]);
  const unexpected = OPTION_KEYS.filter((k) => !options[k] && found[k]);

  return {
    password: pw,
    requestedLength,
    actualLength: pw.length,
    lengthMatches: pw.length === requestedLength,
    requestedCharacterTypes: requested,
    detectedCharacterTypes: found,
    missingRequestedCharacterTypes: missingRequested,
    unexpectedCharacterTypes: unexpected,
    onlyRequestedCharactersUsed: unexpected.length === 0 && pw.length > 0,
    poolSize,
    expectedStrength: { label: expected.label, bits: Number(expected.bits.toFixed(2)) },
  };
}

/* --------------------------------------------------------------- unit conversion */

export const UNIT_CATEGORIES = {
  length: {
    label: 'Length',
    defaults: { from: 'm', to: 'ft' },
    units: {
      mm: { label: 'Millimeter (mm)', factor: 0.001 },
      cm: { label: 'Centimeter (cm)', factor: 0.01 },
      m: { label: 'Meter (m)', factor: 1 },
      km: { label: 'Kilometer (km)', factor: 1000 },
      in: { label: 'Inch (in)', factor: 0.0254 },
      ft: { label: 'Foot (ft)', factor: 0.3048 },
      yd: { label: 'Yard (yd)', factor: 0.9144 },
      mi: { label: 'Mile (mi)', factor: 1609.344 },
    },
  },
  weight: {
    label: 'Weight',
    defaults: { from: 'kg', to: 'lb' },
    units: {
      mg: { label: 'Milligram (mg)', factor: 0.000001 },
      g: { label: 'Gram (g)', factor: 0.001 },
      kg: { label: 'Kilogram (kg)', factor: 1 },
      t: { label: 'Metric ton (t)', factor: 1000 },
      oz: { label: 'Ounce (oz)', factor: 0.028349523125 },
      lb: { label: 'Pound (lb)', factor: 0.45359237 },
      st: { label: 'Stone (st)', factor: 6.35029318 },
    },
  },
  temperature: {
    label: 'Temperature',
    defaults: { from: 'c', to: 'f' },
    units: {
      c: { label: 'Celsius (°C)' },
      f: { label: 'Fahrenheit (°F)' },
      k: { label: 'Kelvin (K)' },
    },
  },
};

const CATEGORY_ALIASES = {
  length: 'length',
  distance: 'length',
  lengths: 'length',
  weight: 'weight',
  mass: 'weight',
  weights: 'weight',
  temperature: 'temperature',
  temp: 'temperature',
  temperatures: 'temperature',
};

const TO_CELSIUS = { c: (v) => v, f: (v) => ((v - 32) * 5) / 9, k: (v) => v - 273.15 };
const FROM_CELSIUS = { c: (v) => v, f: (v) => (v * 9) / 5 + 32, k: (v) => v + 273.15 };

export function normalizeCategory(input) {
  const key = CATEGORY_ALIASES[String(input ?? '').trim().toLowerCase()];
  return key || null;
}

const strip = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9°]/g, '');

/**
 * Resolve a user-supplied unit ("m", "Meter", "meters", "Meter (m)", "°C") to a unit key.
 * Returns { key, label } or null when nothing matches.
 */
/**
 * Resolve a user-supplied unit ("m", "Meter", "meters", "Meter (m)", "(mi)", "°C") to a unit key.
 * Matching is ordered from exact to fuzzy on purpose: a short abbreviation like "mi" must never
 * substring-match "Millimeter (mm)", so substring matching only runs for candidates of 3+ chars.
 * Returns { key, label } or null when nothing matches.
 */
export function resolveUnit(categoryKey, input) {
  const units = UNIT_CATEGORIES[categoryKey]?.units;
  if (!units) return null;
  const raw = String(input ?? '').trim();
  if (!raw) return null;

  const keys = Object.keys(units);
  const lower = raw.toLowerCase();
  const hit = (key) => ({ key, label: units[key].label });

  // The abbreviation inside the label's parentheses: "Mile (mi)" -> "mi".
  const parenOf = (text) => /\(([^)]+)\)/.exec(String(text ?? ''))?.[1];
  // The label without its parenthesised abbreviation: "Kilometer (km)" -> "kilometer".
  const bareOf = (text) => strip(String(text ?? '').replace(/\s*\([^)]*\)\s*$/, ''));

  // 1. Exact unit key ("km", "KM", "m", "in", "t").
  if (units[raw]) return hit(raw);
  const exactKey = keys.find((k) => k.toLowerCase() === lower);
  if (exactKey) return hit(exactKey);

  // 2. Exact full label ("Kilometer (km)").
  const exactLabel = keys.find((k) => strip(units[k].label) === strip(raw));
  if (exactLabel) return hit(exactLabel);

  // 3. The parenthesised abbreviation on either side ("(mi)", "Celsius (°C)" -> "°C").
  const wantedParen = (parenOf(raw) ?? raw).toLowerCase();
  const byParen = keys.find((k) => (parenOf(units[k].label) || '').toLowerCase() === wantedParen);
  if (byParen) return hit(byParen);

  // 4. Label word without the abbreviation ("Kilometer", "Metric ton", "Celsius").
  const bareWanted = bareOf(raw);
  const byBareLabel = keys.find((k) => bareOf(units[k].label) === bareWanted);
  if (byBareLabel) return hit(byBareLabel);

  // 5. Singular/plural tolerance ("meters", "pounds") — only for unambiguous, 3+ char candidates.
  if (bareWanted.length >= 3) {
    const candidates = [bareWanted, bareWanted.replace(/s$/, ''), bareWanted.replace(/^°/, '')].filter(
      (c) => c.length >= 3
    );
    const fuzzy = keys.find((k) => {
      const label = bareOf(units[k].label);
      return candidates.some((c) => label.includes(c));
    });
    if (fuzzy) return hit(fuzzy);
  }

  return null;
}

export function expectedConversion(categoryKey, fromKey, toKey, value) {
  if (categoryKey === 'temperature') return FROM_CELSIUS[toKey](TO_CELSIUS[fromKey](value));
  const units = UNIT_CATEGORIES[categoryKey].units;
  return (value * units[fromKey].factor) / units[toKey].factor;
}

/* ------------------------------------------------------- parsing what the page shows */

/** Parse a number out of text the page rendered ("3.280839895", "1,609.344", "-40", "1.2e-10"). */
export function parseDisplayedNumber(text) {
  if (typeof text !== 'string') return null;
  // Commas are en-US thousands separators here ("1,609.344"), not list separators.
  const cleaned = text.replace(/,/g, '').replace(/\u00a0/g, ' ');
  const match = cleaned.match(/[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

/** Compare two floats the way a UI with 10 significant digits should match. */
export function numbersClose(actual, expected, relativeTolerance = 1e-6) {
  if (actual === null || expected === null || !Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  if (actual === expected) return true;
  const scale = Math.max(1, Math.abs(expected));
  return Math.abs(actual - expected) <= relativeTolerance * scale;
}

/** Parse "12.3 KB" / "1.5 MB" / "840 B" into an approximate byte count. */
export function parseByteSizeText(text) {
  const match = /([\d.,]+)\s*(B|KB|MB|GB|TB)/i.exec(String(text ?? ''));
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  const units = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
  return Math.round(value * units[match[2].toUpperCase()]);
}

/** Pull "N page(s)" out of a line of text. */
export function parsePageCount(text) {
  const match = /(\d+)\s*pages?/i.exec(String(text ?? ''));
  return match ? Number(match[1]) : null;
}

/* ---------------------------------------------------------------- small utils */

/** Clamp an integer into [min, max]; non-numeric input falls back to `fallback`. */
export function clampInt(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** Accept both snake_case and camelCase spellings of an argument. */
export function pickArg(args, ...names) {
  for (const name of names) {
    if (args && args[name] !== undefined && args[name] !== null) return args[name];
  }
  return undefined;
}

/**
 * Parse the PDF merger's summary line: "2 valid files · 5 total pages to merge".
 * (parsePageCount can't be used here — "5 total pages" has a word between the number and "pages".)
 */
export function parseMergeHeader(text) {
  const t = String(text ?? '');
  const validFiles = /(\d+)\s+valid files?/i.exec(t);
  const totalPages = /(\d+)\s+total pages?/i.exec(t);
  return {
    validFiles: validFiles ? Number(validFiles[1]) : null,
    totalPages: totalPages ? Number(totalPages[1]) : null,
  };
}
