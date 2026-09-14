import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Icon from './Icons.jsx';
import { TOOLS } from '../data/tools.js';

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('toolshub-theme', next ? 'dark' : 'light');
    } catch {
      /* private mode — ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className="inline-grid place-items-center w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
    >
      <Icon name={dark ? 'sun' : 'moon'} className="w-4.5 h-4.5" />
    </button>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function Layout({ children }) {
  return (
    <div className="min-h-screen flex flex-col">
      <ScrollToTop />
      <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/85 dark:bg-slate-950/85 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 font-bold text-lg tracking-tight">
            <span className="inline-grid place-items-center w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
              <Icon name="zap" className="w-4 h-4" />
            </span>
            <span>
              Tools<span className="text-indigo-600 dark:text-indigo-400">Hub</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="hidden sm:inline-flex text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              All tools
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <div className="mx-auto max-w-6xl px-4 py-10 grid gap-8 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2 font-bold">
              <span className="inline-grid place-items-center w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
                <Icon name="zap" className="w-3.5 h-3.5" />
              </span>
              ToolsHub
            </div>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400 max-w-xs">
              Small, fast, privacy-friendly tools that run 100% in your browser. No uploads, no
              accounts, no tracking.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Tools
            </h4>
            <ul className="mt-3 space-y-2">
              {TOOLS.map((tool) => (
                <li key={tool.slug}>
                  <Link
                    to={`/tools/${tool.slug}`}
                    className="text-sm text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400"
                  >
                    {tool.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              More tools coming soon
            </h4>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              A word counter, JSON formatter, color picker and more are on the way. Have a
              suggestion? We&apos;d love to hear it.
            </p>
          </div>
        </div>
        <div className="border-t border-slate-200 dark:border-slate-800 py-4 text-center text-xs text-slate-400 dark:text-slate-500">
          © {new Date().getFullYear()} ToolsHub · Built with React + Tailwind CSS · 100%
          client-side
        </div>
      </footer>
    </div>
  );
}
