import { useState } from 'react';
import ToolShell from '../../components/ToolShell.jsx';
import Icon from '../../components/Icons.jsx';
import { getTool } from '../../data/tools.js';
import { CONVERSION_CATEGORIES, convertValue } from '../../lib/converters.js';
import { formatNumber } from '../../lib/format.js';

const tool = getTool('unit-converter');

export default function UnitConverter() {
  const [category, setCategory] = useState('length');
  const [from, setFrom] = useState('m');
  const [to, setTo] = useState('ft');
  const [raw, setRaw] = useState('1');

  const cat = CONVERSION_CATEGORIES[category];

  function switchCategory(key) {
    setCategory(key);
    const defaults = CONVERSION_CATEGORIES[key].defaults;
    setFrom(defaults.from);
    setTo(defaults.to);
  }

  function swap() {
    setFrom(to);
    setTo(from);
  }

  const value = raw.trim() === '' ? null : Number(raw);
  const valid = value !== null && Number.isFinite(value);
  const result = valid ? convertValue(category, from, to, value) : null;

  const fromLabel = cat.units[from].label;
  const toLabel = cat.units[to].label;

  return (
    <ToolShell tool={tool}>
      {/* Category pills */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Conversion category">
        {Object.entries(CONVERSION_CATEGORIES).map(([key, c]) => {
          const active = category === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => switchCategory(key)}
              aria-pressed={active}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                active
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400'
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6">
        <label htmlFor="uc-value" className="block text-sm font-medium">
          Value
        </label>
        <input
          id="uc-value"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Enter a number, e.g. 12 or -3.5"
          className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-3 text-lg placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] gap-2 sm:gap-4 items-end">
          <div>
            <label htmlFor="uc-from" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              From
            </label>
            <select
              id="uc-from"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {Object.entries(cat.units).map(([key, u]) => (
                <option key={key} value={key}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={swap}
            aria-label="Swap from and to units"
            title="Swap units"
            className="mb-0.5 inline-grid place-items-center w-10 h-10 rounded-full border border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-400 dark:hover:bg-indigo-950/50 transition"
          >
            <Icon name="swap" className="w-4 h-4" />
          </button>

          <div>
            <label htmlFor="uc-to" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              To
            </label>
            <select
              id="uc-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {Object.entries(cat.units).map(([key, u]) => (
                <option key={key} value={key}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Result */}
        <div className="mt-5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 p-5 text-center" aria-live="polite">
          {raw.trim() === '' ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Type a value above to convert it.
            </p>
          ) : !valid ? (
            <p className="text-sm text-red-500 dark:text-red-400">
              Please enter a valid number (e.g. 12 or -3.5).
            </p>
          ) : (
            <>
              <p className="text-3xl sm:text-4xl font-bold tracking-tight text-indigo-700 dark:text-indigo-300 break-words">
                {formatNumber(result)}{' '}
                <span className="text-base font-medium text-slate-500 dark:text-slate-400">
                  {toLabel}
                </span>
              </p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {formatNumber(value)} {fromLabel} equals
              </p>
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                1 {fromLabel} = {formatNumber(convertValue(category, from, to, 1))} {toLabel}
              </p>
            </>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
        More categories (area, volume, speed, data…) are coming in a later phase.
      </p>
    </ToolShell>
  );
}
