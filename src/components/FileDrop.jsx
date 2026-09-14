import { useRef, useState } from 'react';
import Icon from './Icons.jsx';

// Reusable drag-&-drop / click-to-browse file input.
export default function FileDrop({
  accept,
  multiple = true,
  onFiles,
  label,
  hint,
  icon = 'upload',
  disabled = false,
}) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);

  function handle(list) {
    if (!list || list.length === 0) return;
    onFiles(Array.from(list));
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) handle(e.dataTransfer.files);
      }}
      className={`rounded-2xl border-2 border-dashed p-8 sm:p-10 text-center transition cursor-pointer select-none
        ${over
          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-400 dark:hover:border-indigo-600'}
        ${disabled ? 'opacity-50 pointer-events-none' : 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500'}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = ''; // allow re-selecting the same file
        }}
      />
      <span
        className={`inline-grid place-items-center w-12 h-12 rounded-xl mb-3 transition
          ${over ? 'bg-indigo-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}
      >
        <Icon name={icon} className="w-6 h-6" />
      </span>
      <p className="font-medium">{label}</p>
      {hint && (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">{hint}</p>
      )}
    </div>
  );
}
