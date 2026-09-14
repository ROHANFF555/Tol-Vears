import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icons.jsx';
import { TOOLS, CATEGORIES } from '../data/tools.js';

function ToolCard({ tool }) {
  return (
    <Link
      to={`/tools/${tool.slug}`}
      className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 transition hover:-translate-y-0.5 hover:shadow-lg hover:border-indigo-300 dark:hover:border-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <div className="flex items-start justify-between">
        <span
          className={`inline-grid place-items-center w-11 h-11 rounded-xl bg-gradient-to-br ${tool.accent} text-white shadow-sm`}
        >
          <Icon name={tool.icon} className="w-5 h-5" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
          {tool.category}
        </span>
      </div>
      <h3 className="mt-4 font-semibold group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
        {tool.name}
      </h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{tool.tagline}</p>
    </Link>
  );
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');

  // Instant client-side filter over name / description / tags / category.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TOOLS.filter((tool) => {
      if (category !== 'All' && tool.category !== category) return false;
      if (!q) return true;
      const haystack = [
        tool.name,
        tool.tagline,
        tool.description,
        tool.category,
        tool.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, category]);

  const hasFilters = query.trim() !== '' || category !== 'All';

  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* Hero + search */}
      <section className="py-14 sm:py-20 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/50 px-3 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300">
          <Icon name="zap" className="w-3.5 h-3.5" />
          {TOOLS.length} free tools · 0 uploads · more coming soon
        </span>
        <h1 className="mt-5 text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
          Everyday tools that run{' '}
          <span className="bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
            entirely in your browser
          </span>
        </h1>
        <p className="mt-4 text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
          Compress images, merge PDFs, generate QR codes and passwords, convert units — fast, free
          and private. Your files never leave your device.
        </p>
        <div className="mt-8 max-w-xl mx-auto relative">
          <Icon
            name="search"
            className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools… e.g. pdf, image, password"
            aria-label="Search tools"
            className="w-full rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 py-3.5 pl-12 pr-11 text-base shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <Icon name="x" className="w-5 h-5" />
            </button>
          )}
        </div>
      </section>

      {/* Category filter + grid */}
      <section className="pb-20">
        <div
          className="flex flex-wrap items-center gap-2 mb-6"
          role="group"
          aria-label="Filter by category"
        >
          {CATEGORIES.map((cat) => {
            const count = cat === 'All' ? TOOLS.length : TOOLS.filter((t) => t.category === cat).length;
            const active = category === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                aria-pressed={active}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition ${
                  active
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400'
                }`}
              >
                {cat} <span className="opacity-60">{count}</span>
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800">
            <p className="text-slate-500 dark:text-slate-400">
              No tools found{query ? <> for “{query}”</> : null}. Try a different keyword or
              category.
            </p>
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setCategory('All');
                }}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 transition"
              >
                <Icon name="refresh" className="w-4 h-4" />
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((tool) => (
              <ToolCard key={tool.slug} tool={tool} />
            ))}
            <div className="rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-5 flex flex-col items-center justify-center text-center min-h-[150px]">
              <p className="font-semibold text-slate-500 dark:text-slate-400">
                More tools coming soon
              </p>
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
                Word counter · JSON formatter · Color picker
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Why ToolsHub */}
      <section className="pb-20 grid gap-4 sm:grid-cols-3">
        {[
          {
            icon: 'shield',
            title: '100% private',
            text: 'Everything runs locally in your browser. No uploads, no servers, no tracking.',
          },
          {
            icon: 'zap',
            title: 'Instant results',
            text: 'No round-trips to a backend — tools respond as fast as your device can think.',
          },
          {
            icon: 'check',
            title: 'Free forever',
            text: 'No accounts, no subscriptions, no usage limits. Just tools that work.',
          },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
          >
            <span className="inline-grid place-items-center w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Icon name={f.icon} className="w-5 h-5" />
            </span>
            <h3 className="mt-3 font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{f.text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
