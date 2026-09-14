import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icons.jsx';

export default function NotFound() {
  useEffect(() => {
    document.title = 'Page not found — ToolsHub';
    return () => {
      document.title = 'ToolsHub — Free Browser Tools';
    };
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <p className="text-6xl font-extrabold bg-gradient-to-r from-indigo-500 to-fuchsia-500 bg-clip-text text-transparent">
        404
      </p>
      <h1 className="mt-4 text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">
        The page you&apos;re looking for doesn&apos;t exist. Head back and pick a tool instead.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-5 py-2.5 transition"
      >
        <Icon name="arrowLeft" className="w-4 h-4" />
        Back to all tools
      </Link>
    </div>
  );
}
