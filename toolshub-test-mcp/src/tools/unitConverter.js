// test_unit_converter — picks a category, selects the from/to units, types a value and reads back
// exactly what the page displays, then re-computes the answer independently so Claude can see both.
import { CONFIG, ROUTES } from '../config.js';
import { openTool, waitForPageState } from '../dom.js';
import {
  UNIT_CATEGORIES,
  expectedConversion,
  normalizeCategory,
  numbersClose,
  parseDisplayedNumber,
  pickArg,
  resolveUnit,
} from '../verify.js';

/** Read the live <select> options so we always test against what the page really offers. */
async function readSelectOptions(page, selector) {
  return page.locator(selector).evaluate((el) =>
    [...el.options].map((o) => ({ value: o.value, label: (o.textContent || '').trim(), selected: o.selected }))
  );
}

async function readResultBox(page) {
  return page.evaluate(() => {
    const box = document.querySelector('div[aria-live="polite"]');
    if (!box) return null;
    const paragraphs = [...box.querySelectorAll('p')];
    const first = paragraphs[0];
    const unitSpan = first?.querySelector('span');
    const text = (box.innerText || '').replace(/\s+/g, ' ').trim();
    return {
      fullText: text,
      resultText: first
        ? (unitSpan ? first.textContent.replace(unitSpan.textContent, '') : first.textContent).trim()
        : null,
      resultUnitLabel: unitSpan ? (unitSpan.textContent || '').trim() : null,
      equalsLine: paragraphs[1] ? (paragraphs[1].textContent || '').trim() : null,
      rateLine: paragraphs[2] ? (paragraphs[2].textContent || '').trim() : null,
      asksForValue: /Type a value above/i.test(text),
      invalidNumberError: /valid number/i.test(text),
    };
  });
}

export const unitConverterTool = {
  name: 'test_unit_converter',
  title: 'Test Unit Converter',
  description:
    'End-to-end test of /tools/unit-converter on the live ToolsHub site. Selects a category (Length / Weight / Temperature), picks the from and to units, types the value, and returns exactly what the page displays — plus the same conversion computed independently by this server, so the math on the live site can be checked.',
  inputSchema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description: 'Conversion category: "Length", "Weight" or "Temperature" (case-insensitive; "mass"/"temp" also accepted).',
      },
      from_unit: {
        type: 'string',
        description: 'Unit to convert FROM. Accepts a key ("km"), an abbreviation ("(km)") or a label ("Kilometer"). Also accepts "fromUnit".',
      },
      to_unit: {
        type: 'string',
        description: 'Unit to convert TO. Same accepted forms as from_unit. Also accepts "toUnit".',
      },
      value: {
        type: 'number',
        description: 'Numeric value to convert, e.g. 12 or -3.5.',
      },
      fromUnit: { type: 'string', description: 'Alias of from_unit.' },
      toUnit: { type: 'string', description: 'Alias of to_unit.' },
    },
    required: ['category', 'value'],
    additionalProperties: false,
  },

  async run({ page, diagnostics }, args = {}) {
    const rawFrom = pickArg(args, 'from_unit', 'fromUnit');
    const rawTo = pickArg(args, 'to_unit', 'toUnit');
    const value = Number(args.value);

    // --- argument validation happens BEFORE the browser is touched, so bad input fails fast ---
    const categoryKey = normalizeCategory(args.category);
    if (!categoryKey) {
      throw new Error(
        `Unknown category "${args.category}". Valid categories: ${Object.values(UNIT_CATEGORIES)
          .map((c) => c.label)
          .join(', ')}.`
      );
    }
    if (!Number.isFinite(value)) {
      throw new Error(`value must be a finite number, got ${JSON.stringify(args.value)}.`);
    }
    const category = UNIT_CATEGORIES[categoryKey];
    const fromKey = resolveUnit(categoryKey, rawFrom ?? category.defaults.from);
    const toKey = resolveUnit(categoryKey, rawTo ?? category.defaults.to);
    if (!fromKey) {
      throw new Error(
        `Unknown ${category.label} unit "${rawFrom}". Valid units: ${Object.entries(category.units)
          .map(([k, u]) => `${k} = ${u.label}`)
          .join('; ')}.`
      );
    }
    if (!toKey) {
      throw new Error(
        `Unknown ${category.label} unit "${rawTo}". Valid units: ${Object.entries(category.units)
          .map(([k, u]) => `${k} = ${u.label}`)
          .join('; ')}.`
      );
    }

    const route = await openTool(page, ROUTES.unitConverter);

    // 1. Category pill.
    const pill = page
      .locator('[role="group"][aria-label="Conversion category"] button', { hasText: category.label })
      .first();
    await pill.waitFor({ state: 'visible', timeout: CONFIG.stepTimeoutMs });
    await pill.click();
    await waitForPageState(
      page,
      (label) => {
        const group = document.querySelector('[role="group"][aria-label="Conversion category"]');
        const active = [...(group?.querySelectorAll('button') || [])].find(
          (b) => (b.textContent || '').trim() === label
        );
        return Boolean(active) && active.getAttribute('aria-pressed') === 'true';
      },
      category.label,
      { label: `the "${category.label}" category pill to become active` }
    );

    // 2. Units — read what the page actually offers, then select.
    const offeredOptions = await readSelectOptions(page, '#uc-from');
    const offeredKeys = offeredOptions.map((o) => o.value);
    const missingFromPage = [fromKey.key, toKey.key].filter((k) => !offeredKeys.includes(k));
    if (missingFromPage.length > 0) {
      throw new Error(
        `The live page's ${category.label} unit list does not contain: ${missingFromPage.join(', ')}. It offers: ${offeredOptions
          .map((o) => `${o.value} (${o.label})`)
          .join(', ')}.`
      );
    }
    await page.selectOption('#uc-from', fromKey.key);
    await page.selectOption('#uc-to', toKey.key);

    // 3. Value.
    await page.fill('#uc-value', String(value));
    await waitForPageState(
      page,
      () => {
        const box = document.querySelector('div[aria-live="polite"]');
        return Boolean(box) && !/Type a value above/i.test(box.innerText || '');
      },
      null,
      { label: 'the conversion result to be displayed' }
    );

    const resultBox = await readResultBox(page);
    const selectedFrom = (await readSelectOptions(page, '#uc-from')).find((o) => o.selected);
    const selectedTo = (await readSelectOptions(page, '#uc-to')).find((o) => o.selected);

    // 4. Independent computation.
    const expected = expectedConversion(categoryKey, fromKey.key, toKey.key, value);
    const shownNumber = parseDisplayedNumber(resultBox?.resultText ?? '');
    const shownRate = parseDisplayedNumber((resultBox?.rateLine ?? '').replace(/^1\s*/, ''));
    const expectedRate = expectedConversion(categoryKey, fromKey.key, toKey.key, 1);

    const matches = numbersClose(shownNumber, expected);
    const rateMatches = numbersClose(shownRate, expectedRate);

    const warnings = [];
    if (resultBox?.invalidNumberError) warnings.push(`The page rejected "${value}" as an invalid number.`);
    if (!resultBox) warnings.push('No result box (div[aria-live="polite"]) found on the page.');
    if (shownNumber === null && !resultBox?.invalidNumberError) {
      warnings.push(`Could not parse a number out of the result text "${resultBox?.resultText}".`);
    }
    if (!matches && shownNumber !== null) {
      warnings.push(
        `Page shows ${shownNumber} ${toKey.label} but ${value} ${fromKey.label} should be ${expected} ${toKey.label}.`
      );
    }
    if (!rateMatches && shownRate !== null) {
      warnings.push(`Page's "1 unit = …" rate is ${shownRate}, expected ${expectedRate}.`);
    }
    if (selectedFrom?.value !== fromKey.key || selectedTo?.value !== toKey.key) {
      warnings.push(
        `Selects ended up on ${selectedFrom?.value} → ${selectedTo?.value} instead of ${fromKey.key} → ${toKey.key}.`
      );
    }

    return {
      route: ROUTES.unitConverter,
      httpStatus: route.status,
      requested: { category: category.label, fromUnit: rawFrom ?? category.defaults.from, toUnit: rawTo ?? category.defaults.to, value },
      resolved: {
        categoryKey,
        from: { key: fromKey.key, label: fromKey.label },
        to: { key: toKey.key, label: toKey.label },
      },
      shownOnPage: {
        resultText: resultBox?.resultText ?? null,
        resultNumber: shownNumber,
        resultUnitLabel: resultBox?.resultUnitLabel ?? null,
        equalsLine: resultBox?.equalsLine ?? null,
        unitRateLine: resultBox?.rateLine ?? null,
        fullResultBoxText: resultBox?.fullText ?? null,
      },
      independentExpectation: {
        formula:
          categoryKey === 'temperature'
            ? `°${fromKey.key.toUpperCase()} → °C → °${toKey.key.toUpperCase()}`
            : `${value} × ${category.units[fromKey.key].factor} ÷ ${category.units[toKey.key].factor}`,
        result: expected,
        resultRounded: Number(expected.toPrecision(10)),
        unitRate: expectedRate,
      },
      matchesExpected: matches,
      unitRateMatches: rateMatches,
      relativeDifference:
        shownNumber !== null && expected !== 0 ? Math.abs((shownNumber - expected) / expected) : null,
      verdict: matches && rateMatches && warnings.length === 0 ? 'pass' : matches ? 'pass-with-warning' : 'fail',
      warnings,
      diagnostics: diagnostics.summary(),
    };
  },
};
