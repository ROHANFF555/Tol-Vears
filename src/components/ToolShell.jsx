import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import Icon from './Icons.jsx';

// Consistent page shell for every tool: metadata, back link, header, body, and privacy notes.
export default function ToolShell({ tool, children }) {
  const { seo } = tool;
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: tool.name,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any (runs in browser)',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    url: `https://tol-vears.onrender.com/tools/${tool.slug}`,
    description: seo.description,
  };

  return (
    <>
      <Helmet>
        <title>{seo.title}</title>
        <meta name="description" content={seo.description} />
        <meta name="keywords" content={seo.keywords.join(', ')} />
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      </Helmet>

      <div className="mx-auto max-w-4xl px-4 py-10 sm:py-12">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
      >
        <Icon name="arrowLeft" className="w-4 h-4" />
        All tools
      </Link>

      <div className="mt-6 flex items-start gap-4">
        <span
          className={`inline-grid place-items-center w-12 h-12 rounded-2xl bg-gradient-to-br ${tool.accent} text-white shadow-sm shrink-0`}
        >
          <Icon name={tool.icon} className="w-6 h-6" />
        </span>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{tool.name}</h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">{tool.tagline}</p>
        </div>
      </div>
      <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">{seo.intro}</p>

      <div className="mt-8">{children}</div>

      <section className="mt-12 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <h2 className="font-semibold">How to use</h2>
        <ol className="mt-3 list-decimal list-inside space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
          {tool.howTo.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        <p className="mt-4 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-4">
          <Icon name="shield" className="w-4 h-4 mt-0.5 shrink-0 text-emerald-500" />
          <span>{tool.privacy}</span>
        </p>
      </section>
      </div>
    </>
  );
}
