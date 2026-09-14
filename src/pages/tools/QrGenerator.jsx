import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import ToolShell from '../../components/ToolShell.jsx';
import Icon from '../../components/Icons.jsx';
import { getTool } from '../../data/tools.js';

const tool = getTool('qr-code-generator');

const QR_SIZES = [
  { key: 'sm', label: 'Small · 256px', px: 256 },
  { key: 'md', label: 'Medium · 512px', px: 512 },
  { key: 'lg', label: 'Large · 1024px', px: 1024 },
];

export default function QrGenerator() {
  const [text, setText] = useState('https://example.com');
  const [sizeKey, setSizeKey] = useState('md');
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState('');
  const px = QR_SIZES.find((s) => s.key === sizeKey)?.px ?? 512;

  // Live generation, debounced while typing.
  useEffect(() => {
    const value = text.trim();
    if (!value) {
      setDataUrl('');
      setError('');
      return;
    }
    const timer = window.setTimeout(() => {
      QRCode.toDataURL(value, { width: px, margin: 2, errorCorrectionLevel: 'M' })
        .then((url) => {
          setDataUrl(url);
          setError('');
        })
        .catch(() => {
          setDataUrl('');
          setError('This text is too long to fit in a single QR code. Try shortening it.');
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [text, px]);

  function download() {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `qr-code-${px}px.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <ToolShell tool={tool}>
      <div className="grid gap-6 md:grid-cols-2 md:items-start">
        {/* Input side */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <label htmlFor="qr-text" className="block text-sm font-medium">
            Text or URL
          </label>
          <textarea
            id="qr-text"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. https://your-website.com"
            className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-3 text-sm font-mono placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
          />
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {text.length} character{text.length !== 1 ? 's' : ''} · updates live as you type
          </p>

          <p className="mt-5 block text-sm font-medium">Download size</p>
          <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="QR code size">
            {QR_SIZES.map((s) => {
              const active = sizeKey === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSizeKey(s.key)}
                  aria-pressed={active}
                  className={`rounded-lg border px-2 py-2 text-xs sm:text-sm font-medium transition ${
                    active
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={download}
            disabled={!dataUrl}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 transition"
          >
            <Icon name="download" className="w-4 h-4" />
            Download PNG
          </button>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-500 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        {/* Preview side */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col items-center justify-center min-h-[280px]">
          {dataUrl ? (
            <>
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                <img
                  src={dataUrl}
                  alt="Generated QR code"
                  className="w-56 h-56 sm:w-64 sm:h-64"
                />
              </div>
              <p className="mt-4 text-xs text-slate-500 dark:text-slate-400 text-center">
                Scan with any camera app · exports at {px}×{px}px
              </p>
            </>
          ) : (
            <div className="text-center px-6">
              <span className="inline-grid place-items-center w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400">
                <Icon name="qr" className="w-7 h-7" />
              </span>
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                {error || 'Type something above and your QR code will appear here.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </ToolShell>
  );
}
