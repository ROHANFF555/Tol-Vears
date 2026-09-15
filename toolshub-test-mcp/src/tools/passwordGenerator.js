// test_password_generator — sets the length slider and the four character-type checkboxes,
// clicks Generate, reads the password back off the page and independently verifies its length,
// character classes and entropy/strength label.
import { CONFIG, ROUTES } from '../config.js';
import { openTool, optionalText, readLabelValue, setRangeValue } from '../dom.js';
import {
  OPTION_KEYS,
  clampInt,
  normalizeOptions,
  parseDisplayedNumber,
  strengthFor,
  poolSizeFor,
  verifyPassword,
} from '../verify.js';

// Visible label prefix for each checkbox in the page's "Character types" fieldset.
const CHECKBOX_LABELS = {
  uppercase: 'Uppercase',
  lowercase: 'Lowercase',
  numbers: 'Numbers',
  symbols: 'Symbols',
};

const PLACEHOLDER = 'Select at least one character type';

export const passwordGeneratorTool = {
  name: 'test_password_generator',
  title: 'Test Password Generator',
  description:
    'End-to-end test of /tools/password-generator on the live ToolsHub site. Sets the length slider (4-64) and the uppercase/lowercase/numbers/symbols checkboxes, clicks "Generate", reads the password back from the page and independently verifies its real length, which character classes it actually contains, and whether the strength meter agrees with the entropy math.',
  inputSchema: {
    type: 'object',
    properties: {
      length: {
        type: 'integer',
        minimum: 4,
        maximum: 64,
        description: 'Requested password length (the slider accepts 4-64). Default 16.',
      },
      options: {
        type: 'object',
        description: 'Which character types to tick. All default to true.',
        properties: {
          uppercase: { type: 'boolean', description: 'Include A-Z. Default true.' },
          lowercase: { type: 'boolean', description: 'Include a-z. Default true.' },
          numbers: { type: 'boolean', description: 'Include 0-9. Default true.' },
          symbols: { type: 'boolean', description: 'Include !@#$%^&*… Default true.' },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },

  async run({ page, diagnostics }, args = {}) {
    const requestedRaw = args.length ?? 16;
    const length = clampInt(requestedRaw, 4, 64, 16);
    const options = normalizeOptions(args.options);
    const enabledCount = OPTION_KEYS.filter((k) => options[k]).length;

    const route = await openTool(page, ROUTES.passwordGenerator);

    // 1. Length slider.
    const sliderValue = await setRangeValue(page, '#pw-length', length);
    const lengthBadge = await readLabelValue(page, 'Length');

    // 2. Character-type checkboxes.
    const checkboxStates = {};
    for (const key of OPTION_KEYS) {
      const box = page
        .locator('label', { hasText: CHECKBOX_LABELS[key] })
        .locator('input[type="checkbox"]')
        .first();
      await box.waitFor({ state: 'attached', timeout: CONFIG.stepTimeoutMs });
      if (options[key]) await box.check();
      else await box.uncheck();
      checkboxStates[key] = await box.isChecked().catch(() => null);
    }

    // 3. Generate.
    const generateButton = page.locator('button', { hasText: /^Generate$/i }).first();
    const generateEnabled = await generateButton.evaluate((el) => !el.disabled).catch(() => false);
    if (generateEnabled) await generateButton.click();

    // 4. Read the result.
    const display = page.locator('[aria-label="Generated password"]').first();
    await display.waitFor({ state: 'visible', timeout: CONFIG.stepTimeoutMs });
    const rawText = (await optionalText(display, { timeout: 3000 })) || '';
    const password = rawText.includes(PLACEHOLDER) ? '' : rawText;

    const strengthText = await readLabelValue(page, 'Strength');
    const strengthLabel = strengthText ? strengthText.split('·')[0].trim() : null;
    const strengthBitsShown = strengthText ? parseDisplayedNumber(strengthText.split('·')[1] || '') : null;
    const pageAlert = await optionalText(page.locator('[role="alert"]'));

    // 5. Independent verification.
    const poolSize = poolSizeFor(options);
    const expectedStrength = strengthFor(length, poolSize);
    const verification = verifyPassword({ password, requestedLength: length, options });

    const warnings = [];
    if (Number(sliderValue) !== length) {
      warnings.push(`Length slider reports ${sliderValue} but ${length} was requested.`);
    }
    if (lengthBadge !== null && !String(lengthBadge).startsWith(String(length))) {
      warnings.push(`Length badge shows "${lengthBadge}" but ${length} was requested.`);
    }
    for (const key of OPTION_KEYS) {
      if (checkboxStates[key] !== options[key]) {
        warnings.push(`Checkbox "${CHECKBOX_LABELS[key]}" is ${checkboxStates[key] ? 'ticked' : 'unticked'}, expected ${options[key] ? 'ticked' : 'unticked'}.`);
      }
    }
    if (enabledCount > 0 && !password) {
      warnings.push('No password was rendered even though at least one character type was selected.');
    }
    if (password && !verification.lengthMatches) {
      warnings.push(`Password is ${verification.actualLength} characters long but ${length} were requested.`);
    }
    if (verification.unexpectedCharacterTypes.length > 0) {
      warnings.push(
        `Password contains character types that were NOT requested: ${verification.unexpectedCharacterTypes.join(', ')}.`
      );
    }
    if (verification.missingRequestedCharacterTypes.length > 0 && password.length >= 12) {
      warnings.push(
        `Password does not contain every requested character type (missing: ${verification.missingRequestedCharacterTypes.join(', ')}). ` +
          'With a uniform random draw this can happen by chance, but the generator does not guarantee one character per class.'
      );
    }
    if (strengthLabel && expectedStrength.label && strengthLabel.toLowerCase() !== expectedStrength.label.toLowerCase()) {
      warnings.push(
        `Strength meter says "${strengthLabel}" but ${length} chars from a pool of ${poolSize} is ${expectedStrength.bits.toFixed(1)} bits = "${expectedStrength.label}".`
      );
    }
    if (strengthBitsShown !== null && Math.abs(strengthBitsShown - expectedStrength.bits) > 1.5) {
      warnings.push(`Strength meter shows ~${strengthBitsShown} bits, expected ~${expectedStrength.bits.toFixed(1)} bits.`);
    }
    if (enabledCount === 0 && !pageAlert) {
      warnings.push('All character types were unticked but the page showed no warning message.');
    }

    return {
      route: ROUTES.passwordGenerator,
      httpStatus: route.status,
      requested: {
        length: requestedRaw,
        lengthAfterClampingToSliderRange: length,
        clamped: Number(requestedRaw) !== length,
        options,
        checkboxesObserved: checkboxStates,
      },
      password,
      actualLength: verification.actualLength,
      requestedLength: length,
      lengthMatches: verification.lengthMatches,
      detectedCharacterTypes: verification.detectedCharacterTypes,
      missingRequestedCharacterTypes: verification.missingRequestedCharacterTypes,
      unexpectedCharacterTypes: verification.unexpectedCharacterTypes,
      onlyRequestedCharactersUsed: verification.onlyRequestedCharactersUsed,
      strengthShownOnPage: { label: strengthLabel, bits: strengthBitsShown, raw: strengthText },
      expectedStrength: { label: expectedStrength.label, bits: Number(expectedStrength.bits.toFixed(2)) },
      poolSize,
      pageAlert,
      verdict:
        enabledCount === 0
          ? 'skipped (all character types disabled)'
          : password && verification.lengthMatches && verification.onlyRequestedCharactersUsed && warnings.length === 0
            ? 'pass'
            : password && verification.lengthMatches
              ? 'pass-with-warning'
              : 'fail',
      warnings,
      diagnostics: diagnostics.summary(),
    };
  },
};
