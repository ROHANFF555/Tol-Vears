import { Helmet } from 'react-helmet-async';

export default function LegalPage({ title, description, children }) {
  return (
    <>
      <Helmet>
        <title>{`${title} | ToolsHub`}</title>
        <meta name="description" content={description} />
      </Helmet>
      <article className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Last updated September 16, 2026</p>
        <div className="mt-8 space-y-6 text-slate-600 dark:text-slate-300 leading-7">{children}</div>
      </article>
    </>
  );
}
