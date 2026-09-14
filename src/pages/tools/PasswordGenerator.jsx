import { useCallback, useEffect, useState } from 'react';
import ToolShell from '../../components/ToolShell.jsx';
import Icon from '../../components/Icons.jsx';
import { getTool } from '../../data/tools.js';
import {
  CHAR_SETS,
  buildPool,
  generatePassword,
  passwordStrength,
} from '../../lib/password.js';

const tool = getTool('password-generator');

const STRENGTH_STYLES = {
  0: { bar: '', text: 'text-slate-400' },
  1: { bar: 'bg-red-500', text: 'text-red-500 dark:text-red-400' },
  2: { bar: 'bg-amber-500', text: 'text-amber-500 dark:text-amber-400' },
  3: { bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
};

export default function PasswordGenerator() {
  const [length, setLength] = useState(16);
  const [options, setOptions] = useState({ upper: true, lower: true, numbers: true, symbols: true });
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);

  const pool = buildPool(options);
  const strength = passwordStrength(length, pool.length);

  const regenerate = useCallback(() => {
    setPassword(generatePassword(length, pool));
  }, [length, pool]);

  // Live update: regenerate whenever length or character options change.
  useEffect(() => {
    setPassword(generatePassword(length, pool));
    setCopied(false);
  }, [length, pool]);

  async function copy() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
    } catch {
      // Fallback for browsers without the async clipboard API
      const ta = document.createElement('textarea');
      ta.value = password;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* give up silently */
      }
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  const style = STRENGTH_STYLES[strength.level];
  const barWidth = Math.min(100, Math.round((strength.bits / 128) * 100));

  return (
    <ToolShell tool={tool}>
      {/* Result */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <p
          aria-live="polite"
          aria-label="Generated password"
          className="min-h-[2.5rem] font-mono text-lg sm:text-2xl break-all select-all"
        >
          {password || (
            <span className="text-slate-400 dark:text-slate-500 text-base font-sans">
              Select at least one character type below
            </span>
          )}
        </p>
        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={regenerate}
            disabled={pool.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 transition"
          >
            <Icon name="refresh" className="w-4 h-4" />
            Generate
          </button>
          <button
            type="button"
            onClick={copy}
            disabled={!password}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 dark:text-slate-200 text-sm font-medium px-4 py-2.5 transition"
          >
            <Icon name={copied ? 'check' : 'copy'} className="w-4 h-4" />
            {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>
        </div>
      </div>

      {/* Strength */}
      <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500 dark:text-slate-400">Strength</span>
          <span className={`font-semibold ${style.text}`}>
            {strength.label}
            {strength.bits > 0 && (
              <span className="font-normal text-slate-400"> · ~{Math.round(strength.bits)} bits</span>
            )}
          </span>
        </div>
        <div className="mt-2.5 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${style.bar}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>

      {/* Options */}
      <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="flex items-center justify-between text-sm font-medium">
          <label htmlFor="pw-length">Length</label>
          <span className="inline-grid place-items-center min-w-12 px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold tabular-nums">
            {length}
          </span>
        </div>
        <input
          id="pw-length"
          type="range"
          min="4"
          max="64"
          step="1"
          value={length}
          onChange={(e) => setLength(Number(e.target.value))}
          className="mt-3 w-full accent-indigo-600"
        />
        <div className="mt-1 flex justify-between text-xs text-slate-400">
          <span>4</span>
          <span>64</span>
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium">Character types</legend>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(CHAR_SETS).map(([key, set]) => (
              <label
                key={key}
                className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-sm cursor-pointer transition has-[:checked]:border-indigo-400 dark:has-[:checked]:border-indigo-700 has-[:checked]:bg-indigo-50/60 dark:has-[:checked]:bg-indigo-950/40 ${
                  options[key]
                    ? 'border-indigo-400 dark:border-indigo-700 bg-indigo-50/60 dark:bg-indigo-950/40'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <input
                  type="checkbox"
                  checked={options[key]}
                  onChange={(e) => setOptions((prev) => ({ ...prev, [key]: e.target.checked }))}
                  className="w-4 h-4 accent-indigo-600"
                />
                <span className="font-medium text-slate-700 dark:text-slate-200">{set.label}</span>
              </label>
            ))}
          </div>
          {pool.length === 0 && (
            <p role="alert" className="mt-3 text-sm text-red-500 dark:text-red-400">
              Select at least one character type to generate a password.
            </p>
          )}
        </fieldset>
      </div>

      <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
        Generated with your browser&apos;s cryptographically secure random number generator —
        nothing is stored or sent anywhere.
      </p>
    </ToolShell>
  );
}
