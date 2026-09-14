import { useCallback, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import ToolShell from '../../components/ToolShell.jsx';
import FileDrop from '../../components/FileDrop.jsx';
import Icon from '../../components/Icons.jsx';
import { getTool } from '../../data/tools.js';
import { formatBytes } from '../../lib/format.js';

const tool = getTool('pdf-merger');
let nextId = 1;

export default function PdfMerger() {
  const [files, setFiles] = useState([]);
  const [notice, setNotice] = useState('');
  const [merging, setMerging] = useState(false);
  const [result, setResult] = useState(null);
  const dragIndex = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  const showNotice = useCallback((message) => {
    setNotice(message);
    window.clearTimeout(showNotice._timer);
    showNotice._timer = window.setTimeout(() => setNotice(''), 6000);
  }, []);

  async function inspectEntry(entry) {
    try {
      const bytes = await entry.file.arrayBuffer();
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
      const pageCount = doc.getPageCount();
      if (pageCount < 1) throw new Error('empty document');
      setFiles((prev) =>
        prev.map((f) => (f.id === entry.id ? { ...f, pageCount, status: 'ready', error: '' } : f))
      );
    } catch {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === entry.id
            ? {
                ...f,
                status: 'error',
                error: 'Could not read this PDF — it may be corrupted or password-protected.',
              }
            : f
        )
      );
    }
  }

  async function addFiles(fileList) {
    const accepted = [];
    const rejected = [];
    for (const file of fileList) {
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) accepted.push(file);
      else rejected.push(file.name);
    }
    if (rejected.length > 0) {
      showNotice(
        `Skipped ${rejected.length} non-PDF file${rejected.length > 1 ? 's' : ''}: ${rejected.join(', ')}`
      );
    }
    if (accepted.length === 0) return;

    const entries = accepted.map((file) => ({
      id: nextId++,
      file,
      name: file.name,
      size: file.size,
      pageCount: null,
      status: 'loading',
      error: '',
    }));
    setFiles((prev) => [...prev, ...entries]);
    setResult(null);
    await Promise.all(entries.map(inspectEntry));
  }

  function move(from, to) {
    setFiles((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setResult(null);
  }

  function removeFile(id) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setResult(null);
  }

  const readyFiles = files.filter((f) => f.status === 'ready');
  const loading = files.some((f) => f.status === 'loading');
  const totalPages = readyFiles.reduce((sum, f) => sum + (f.pageCount || 0), 0);

  async function merge() {
    if (readyFiles.length === 0) {
      showNotice('Add at least one valid PDF first.');
      return;
    }
    setMerging(true);
    try {
      const merged = await PDFDocument.create();
      let pageCount = 0;
      for (const entry of readyFiles) {
        const bytes = await entry.file.arrayBuffer();
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await merged.copyPages(doc, doc.getPageIndices());
        pages.forEach((page) => merged.addPage(page));
        pageCount += pages.length;
      }
      merged.setTitle('Merged with ToolsHub');
      merged.setProducer('ToolsHub — client-side PDF merger (pdf-lib)');
      const out = await merged.save();
      const blob = new Blob([out], { type: 'application/pdf' });
      setResult((prev) => {
        if (prev && prev.url) URL.revokeObjectURL(prev.url);
        return { url: URL.createObjectURL(blob), size: blob.size, pages: pageCount };
      });
    } catch (err) {
      showNotice(`Merge failed: ${err?.message || 'unknown error'}`);
    } finally {
      setMerging(false);
    }
  }

  return (
    <ToolShell tool={tool}>
      <FileDrop
        accept="application/pdf,.pdf"
        multiple
        onFiles={addFiles}
        label="Drop PDF files here or click to browse"
        hint="Add two or more PDFs and arrange them in the order you want."
      />

      {notice && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 text-sm px-4 py-3"
        >
          {notice}
        </p>
      )}

      {files.length > 0 && (
        <div className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-slate-600 dark:text-slate-300">
              <span className="font-semibold">{readyFiles.length}</span> valid file
              {readyFiles.length !== 1 ? 's' : ''} ·{' '}
              <span className="font-semibold">{totalPages}</span> total page
              {totalPages !== 1 ? 's' : ''} to merge
            </p>
            <button
              type="button"
              onClick={merge}
              disabled={merging || loading || readyFiles.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 transition"
            >
              <Icon name={merging ? 'loader' : 'fileText'} className={`w-4 h-4 ${merging ? 'animate-spin' : ''}`} />
              {merging ? 'Merging…' : 'Merge PDFs'}
            </button>
          </div>

          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {files.map((entry, idx) => (
              <li
                key={entry.id}
                draggable={entry.status !== 'loading'}
                onDragStart={() => {
                  dragIndex.current = idx;
                }}
                onDragEnter={() => setDragOver(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex.current !== null) move(dragIndex.current, idx);
                  dragIndex.current = null;
                  setDragOver(null);
                }}
                onDragEnd={() => {
                  dragIndex.current = null;
                  setDragOver(null);
                }}
                className={`flex items-center gap-2.5 sm:gap-3 px-3 sm:px-5 py-3 bg-white dark:bg-slate-900
                  ${dragOver === idx && dragIndex.current !== null && dragIndex.current !== idx ? 'ring-2 ring-inset ring-indigo-400' : ''}`}
              >
                <span className="text-slate-300 dark:text-slate-600 cursor-grab shrink-0" aria-hidden="true">
                  <Icon name="grip" className="w-5 h-5" />
                </span>
                <span className="inline-grid place-items-center w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-300 shrink-0">
                  {idx + 1}
                </span>
                <Icon name="fileText" className="w-5 h-5 text-rose-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" title={entry.name}>
                    {entry.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {entry.status === 'ready' && (
                      <>
                        {formatBytes(entry.size)} · {entry.pageCount} page
                        {entry.pageCount !== 1 ? 's' : ''}
                      </>
                    )}
                    {entry.status === 'loading' && 'Reading pages…'}
                    {entry.status === 'error' && (
                      <span className="text-red-500 dark:text-red-400">{entry.error}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => move(idx, idx - 1)}
                    disabled={idx === 0}
                    aria-label={`Move ${entry.name} up`}
                    className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    <Icon name="arrowUp" className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(idx, idx + 1)}
                    disabled={idx === files.length - 1}
                    aria-label={`Move ${entry.name} down`}
                    className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    <Icon name="arrowDown" className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeFile(entry.id)}
                    aria-label={`Remove ${entry.name}`}
                    className="p-1.5 rounded-md text-slate-400 hover:text-red-500 transition"
                  >
                    <Icon name="trash" className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {files.length === 0 && (
        <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
          Merging happens locally with pdf-lib — your documents never leave your browser.
        </p>
      )}

      {result && (
        <div className="mt-6 rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <Icon name="check" className="w-5 h-5" />
              Merged PDF ready
            </p>
            <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-1">
              {result.pages} page{result.pages !== 1 ? 's' : ''} · {formatBytes(result.size)}
            </p>
          </div>
          <a
            href={result.url}
            download="merged.pdf"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2.5 transition"
          >
            <Icon name="download" className="w-4 h-4" />
            Download merged PDF
          </a>
        </div>
      )}
    </ToolShell>
  );
}
