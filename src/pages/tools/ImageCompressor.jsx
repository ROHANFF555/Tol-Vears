import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import ToolShell from '../../components/ToolShell.jsx';
import FileDrop from '../../components/FileDrop.jsx';
import Icon from '../../components/Icons.jsx';
import { getTool } from '../../data/tools.js';
import { formatBytes, saveBlob, baseName } from '../../lib/format.js';

const tool = getTool('image-compressor');

const OUTPUT_FORMATS = [
  { value: 'auto', label: 'Same as input' },
  { value: 'image/jpeg', label: 'JPEG' },
  { value: 'image/webp', label: 'WebP' },
  { value: 'image/png', label: 'PNG' },
];

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
};

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/bmp';
const MAX_DIMENSION = 6000; // safety cap for very large images
let nextId = 1;

// Canvas-based compression: decode → draw → re-encode. 100% client-side.
async function compressImage(file, quality, format) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Unsupported or corrupted image file.'));
      el.src = objectUrl;
    });
    if (!img.naturalWidth || !img.naturalHeight) {
      throw new Error('Image has invalid dimensions.');
    }
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not supported in this browser.');
    ctx.drawImage(img, 0, 0, width, height);

    const targetMime = format === 'auto' ? file.type || 'image/png' : format;
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not encode image.'))),
        targetMime,
        targetMime === 'image/png' ? undefined : quality / 100
      );
    });
    return { blob, mime: targetMime, width, height, resized: scale < 1 };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function ImageCompressor() {
  const [items, setItems] = useState([]);
  const [quality, setQuality] = useState(70);
  const [format, setFormat] = useState('auto');
  const [notice, setNotice] = useState('');
  const [zipping, setZipping] = useState(false);

  const runRef = useRef(0);
  const itemsRef = useRef([]);
  const optionsRef = useRef({ quality, format });
  optionsRef.current = { quality, format };

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const showNotice = useCallback((message) => {
    setNotice(message);
    window.clearTimeout(showNotice._timer);
    showNotice._timer = window.setTimeout(() => setNotice(''), 5000);
  }, []);

  // Compress a list of items sequentially; a newer run cancels the older one.
  const compressItems = useCallback(async (targets) => {
    const run = ++runRef.current;
    for (const target of targets) {
      if (runRef.current !== run) return;
      setItems((prev) =>
        prev.map((i) => (i.id === target.id ? { ...i, status: 'working', error: '' } : i))
      );
      try {
        const result = await compressImage(
          target.file,
          optionsRef.current.quality,
          optionsRef.current.format
        );
        if (runRef.current !== run) return;
        setItems((prev) =>
          prev.map((i) => {
            if (i.id !== target.id) return i;
            if (i.outUrl) URL.revokeObjectURL(i.outUrl);
            return {
              ...i,
              status: 'done',
              blob: result.blob,
              outUrl: URL.createObjectURL(result.blob),
              outSize: result.blob.size,
              outMime: result.mime,
              width: result.width,
              height: result.height,
              resized: result.resized,
              error: '',
            };
          })
        );
      } catch (err) {
        if (runRef.current !== run) return;
        setItems((prev) =>
          prev.map((i) =>
            i.id === target.id
              ? { ...i, status: 'error', error: err.message || 'Compression failed.' }
              : i
          )
        );
      }
    }
  }, []);

  const addFiles = useCallback(
    (fileList) => {
      const images = fileList.filter((f) => f.type && f.type.startsWith('image/'));
      const skipped = fileList.length - images.length;
      if (skipped > 0) {
        showNotice(
          `${skipped} file${skipped > 1 ? 's' : ''} skipped — only images (JPG, PNG, WebP, GIF, BMP) can be compressed.`
        );
      }
      if (images.length === 0) return;
      const newItems = images.map((file) => ({
        id: nextId++,
        file,
        name: file.name,
        origSize: file.size,
        origUrl: URL.createObjectURL(file),
        status: 'queued',
        blob: null,
        outUrl: null,
        outSize: 0,
        outMime: '',
        width: 0,
        height: 0,
        resized: false,
        error: '',
      }));
      setItems((prev) => [...prev, ...newItems]);
      compressItems(newItems);
    },
    [compressItems, showNotice]
  );

  // Live preview: re-compress everything (debounced) when quality/format changes.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const targets = itemsRef.current.filter((i) => i.file);
      if (targets.length > 0) compressItems(targets);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [quality, format, compressItems]);

  function removeItem(id) {
    runRef.current += 1; // cancel in-flight work for the removed item
    setItems((prev) =>
      prev.flatMap((i) => {
        if (i.id !== id) return [i];
        URL.revokeObjectURL(i.origUrl);
        if (i.outUrl) URL.revokeObjectURL(i.outUrl);
        return [];
      })
    );
  }

  function clearAll() {
    runRef.current += 1;
    setItems((prev) => {
      prev.forEach((i) => {
        URL.revokeObjectURL(i.origUrl);
        if (i.outUrl) URL.revokeObjectURL(i.outUrl);
      });
      return [];
    });
  }

  function downloadOne(item) {
    if (!item.blob) return;
    const ext = EXTENSIONS[item.outMime] || 'img';
    saveBlob(item.blob, `${baseName(item.name)}-compressed.${ext}`);
  }

  async function downloadZip() {
    const done = items.filter((i) => i.status === 'done' && i.blob);
    if (done.length === 0) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      const used = new Set();
      done.forEach((item, idx) => {
        const ext = EXTENSIONS[item.outMime] || 'img';
        let name = `${baseName(item.name)}-compressed.${ext}`;
        if (used.has(name)) name = `${baseName(item.name)}-compressed-${idx + 1}.${ext}`;
        used.add(name);
        zip.file(name, item.blob);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      saveBlob(blob, 'compressed-images.zip');
    } catch {
      showNotice('Could not create the ZIP file. Please try again.');
    } finally {
      setZipping(false);
    }
  }

  const stats = useMemo(() => {
    const done = items.filter((i) => i.status === 'done');
    const orig = done.reduce((s, i) => s + i.origSize, 0);
    const out = done.reduce((s, i) => s + i.outSize, 0);
    const saved = orig > 0 ? Math.round((1 - out / orig) * 100) : 0;
    return { count: done.length, orig, out, saved };
  }, [items]);

  const anyDone = stats.count > 0;

  return (
    <ToolShell tool={tool}>
      <FileDrop
        accept={ACCEPT}
        multiple
        onFiles={addFiles}
        icon="image"
        label="Drop images here or click to browse"
        hint="JPG, PNG, WebP, GIF or BMP — add as many as you like. Files never leave your device."
      />

      {notice && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 text-sm px-4 py-3"
        >
          {notice}
        </p>
      )}

      {items.length > 0 && (
        <div className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-sm font-medium">
                <label htmlFor="ic-quality">Quality</label>
                <span className="tabular-nums text-indigo-600 dark:text-indigo-400 font-semibold">
                  {quality}%
                </span>
              </div>
              <input
                id="ic-quality"
                type="range"
                min="10"
                max="100"
                step="5"
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="mt-2.5 w-full accent-indigo-600"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Lower = smaller files. Changes apply automatically to all images.
              </p>
            </div>
            <div className="sm:w-48">
              <label
                htmlFor="ic-format"
                className="block text-sm font-medium"
              >
                Output format
              </label>
              <select
                id="ic-format"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {OUTPUT_FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                PNG is lossless — quality applies to JPEG/WebP.
              </p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-slate-600 dark:text-slate-300">
              {anyDone ? (
                <>
                  <span className="font-semibold">{stats.count}</span> image
                  {stats.count > 1 ? 's' : ''} · {formatBytes(stats.orig)} →{' '}
                  <span className="font-semibold">{formatBytes(stats.out)}</span>{' '}
                  {stats.saved > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      (−{stats.saved}%)
                    </span>
                  )}
                </>
              ) : (
                'Processing…'
              )}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={downloadZip}
                disabled={!anyDone || zipping}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-3.5 py-2 transition"
              >
                <Icon name={zipping ? 'loader' : 'download'} className={`w-4 h-4 ${zipping ? 'animate-spin' : ''}`} />
                {zipping ? 'Zipping…' : 'Download all (.zip)'}
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-medium px-3.5 py-2 transition"
              >
                <Icon name="trash" className="w-4 h-4" />
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <ul className="mt-4 space-y-3">
          {items.map((item) => {
            const pct =
              item.status === 'done' && item.origSize > 0
                ? Math.round((1 - item.outSize / item.origSize) * 100)
                : 0;
            return (
              <li
                key={item.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4 flex items-center gap-3 sm:gap-4"
              >
                <img
                  src={item.outUrl || item.origUrl}
                  alt=""
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover bg-slate-100 dark:bg-slate-800 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate" title={item.name}>
                    {item.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {item.status === 'done' && (
                      <>
                        {formatBytes(item.origSize)} →{' '}
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {formatBytes(item.outSize)}
                        </span>
                        {item.width > 0 && (
                          <>
                            {' '}
                            · {item.width}×{item.height}
                            {item.resized ? ' (resized)' : ''}
                          </>
                        )}
                      </>
                    )}
                    {item.status === 'working' && 'Compressing…'}
                    {item.status === 'queued' && 'Queued…'}
                    {item.status === 'error' && (
                      <span className="text-red-500 dark:text-red-400">{item.error}</span>
                    )}
                  </p>
                  {item.status === 'done' && (
                    <p
                      className={`text-xs mt-1 font-medium ${
                        pct > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {pct > 0 ? `↓ ${pct}% smaller` : 'No size gain — try lower quality or WebP'}
                    </p>
                  )}
                </div>
                {item.status === 'working' && (
                  <Icon name="loader" className="w-5 h-5 animate-spin text-indigo-500 shrink-0" />
                )}
                {item.status === 'done' && (
                  <button
                    type="button"
                    onClick={() => downloadOne(item)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2 shrink-0 transition"
                  >
                    <Icon name="download" className="w-4 h-4" />
                    <span className="hidden sm:inline">Download</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  aria-label={`Remove ${item.name}`}
                  className="text-slate-400 hover:text-red-500 shrink-0 transition"
                >
                  <Icon name="trash" className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {items.length === 0 && (
        <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
          Compression happens locally with the Canvas API — nothing is uploaded.
        </p>
      )}
    </ToolShell>
  );
}
