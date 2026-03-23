'use client';

import { useEffect, useRef, useState } from 'react';
import {
  PocModelType,
  Poc1MediaResult,
  Poc1ResultTag,
} from '@/types';
import { FIXED_TAG_DEFS, FREE_TEXT_TAG_DEFS } from './poc1-tag-definitions';

// ---------------------------------------------------------------------------
// Toast component
// ---------------------------------------------------------------------------

type ToastEntry = { id: number; type: 'success' | 'error'; message: string };

function Toast({ toasts, onDismiss }: { toasts: ToastEntry[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 w-80 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm animate-slide-in ${
            t.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {t.type === 'success' ? (
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          <span className="flex-1 whitespace-pre-wrap break-words">{t.message}</span>
          <button
            className="shrink-0 text-slate-400 hover:text-slate-600 leading-none text-base"
            onClick={() => onDismiss(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// POC model list
// ---------------------------------------------------------------------------

const POC_MODELS: {
  value: PocModelType;
  label: string;
  howItWorks: { step: string; detail: string }[];
}[] = [
  {
    value: PocModelType.MARIADB_ONLY,
    label: 'MariaDB Only',
    howItWorks: [
      { step: 'Mandatory fixed-tag filter', detail: 'Keeps only media that match every mandatory fixed tag.' },
      { step: 'Optional fixed-tag scoring', detail: 'Scores remaining media by how many optional fixed tags match.' },
      { step: 'Free-text vector search', detail: 'Generates an embedding for each free-text input, then runs a VECTOR similarity search against stored embeddings.' },
      { step: 'Weighted score merge', detail: 'Combines fixed-tag score and vector similarity into a single final rank.' },
      { step: 'Top-N results returned', detail: 'Returns results sorted by final rank, filtered by min QA score if set.' },
    ],
  },
  // MariaDB + Qdrant and MariaDB + Elasticsearch are disabled until those services are configured.
];

// ---------------------------------------------------------------------------
// POC-1 state types
// ---------------------------------------------------------------------------

interface FixedTagState {
  name: string;
  selectedValues: string[];
  isMandatory: boolean;
}

interface FreeTextTagState {
  name: string;
  values: string[];
}

// ---------------------------------------------------------------------------
// Multi-select filterable dropdown component
// ---------------------------------------------------------------------------

function MultiSelectDropdown({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(filter.toLowerCase())
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFilter('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function toggle(opt: string) {
    if (selected.includes(opt)) {
      onChange(selected.filter((v) => v !== opt));
    } else {
      onChange([...selected, opt]);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full min-h-[36px] text-left border rounded-lg px-3 py-1.5 text-sm text-slate-800 bg-white transition-colors flex flex-wrap gap-1 items-center ${
          open ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        {selected.length === 0 ? (
          <span className="text-slate-400">Select values...</span>
        ) : (
          selected.map((v) => (
            <span
              key={v}
              className="bg-indigo-100 text-indigo-800 text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
            >
              {v}
              <span
                role="button"
                className="cursor-pointer hover:text-red-600 font-bold leading-none"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onChange(selected.filter((s) => s !== v));
                }}
              >
                ×
              </span>
            </span>
          ))
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg flex flex-col max-h-64">
          {/* Filter input */}
          <div className="p-2 border-b border-slate-100">
            <input
              type="text"
              autoFocus
              placeholder="Type to filter..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          {/* Options list */}
          <div className="overflow-y-auto flex-1 py-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">No options match</p>
            ) : (
              filtered.map((opt) => (
                <label
                  key={opt}
                  className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-indigo-50 text-sm text-slate-800"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(opt)}
                    onChange={() => toggle(opt)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-300"
                  />
                  <span>{opt}</span>
                </label>
              ))
            )}
          </div>

          {/* Footer */}
          {selected.length > 0 && (
            <div className="p-2 border-t border-slate-100 flex justify-between items-center">
              <span className="text-xs text-slate-500">{selected.length} selected</span>
              <button
                type="button"
                className="text-xs text-red-500 hover:text-red-700"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange([]);
                }}
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chip text input component (replaces AutoTextarea for free-text tags)
// ---------------------------------------------------------------------------

function ChipTextInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');

  function addChip(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed || values.includes(trimmed)) return;
    onChange([...values, trimmed]);
    setInput('');
  }

  function removeChip(chip: string) {
    onChange(values.filter((v) => v !== chip));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addChip(input);
    }
  }

  return (
    <div className="w-full border border-slate-300 rounded-lg bg-white focus-within:ring-2 focus-within:ring-indigo-400 focus-within:border-indigo-400 transition-colors">
      {/* Chips */}
      {values.length > 0 && (
        <div className="flex flex-col gap-1 px-3 pt-2">
          {values.map((chip) => (
            <span
              key={chip}
              className="flex items-center justify-between gap-2 bg-violet-100 text-violet-800 text-xs px-2.5 py-1 rounded-md w-full"
            >
              <span className="break-all">{chip}</span>
              <span
                role="button"
                className="cursor-pointer hover:text-red-600 font-bold leading-none shrink-0"
                onMouseDown={(e) => {
                  e.preventDefault();
                  removeChip(chip);
                }}
              >
                ×
              </span>
            </span>
          ))}
        </div>
      )}
      {/* Input row */}
      <div className="relative flex items-center">
        <input
          type="text"
          value={input}
          placeholder={values.length === 0 ? (placeholder ?? 'Type and press Enter to add...') : 'Add another...'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-3 py-2 pr-28 text-sm text-slate-800 placeholder:text-slate-400 bg-transparent focus:outline-none"
        />
        {input.trim() && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              addChip(input);
            }}
            className="absolute right-2 flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-600 text-xs font-medium px-2 py-0.5 rounded transition-colors"
          >
            <kbd className="font-sans">↵</kbd>
            <span>Enter</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// POC-1 Tag Matrix
// ---------------------------------------------------------------------------

function Poc1TagMatrix({
  fixedTags,
  freeTags,
  onFixedChange,
  onFreeChange,
}: {
  fixedTags: FixedTagState[];
  freeTags: FreeTextTagState[];
  onFixedChange: (index: number, patch: Partial<FixedTagState>) => void;
  onFreeChange: (index: number, values: string[]) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left px-4 py-3 font-semibold text-slate-600 w-[30%]">Tag</th>
            <th className="text-left px-4 py-3 font-semibold text-slate-600">Value</th>
            <th className="text-center px-4 py-3 font-semibold text-slate-600 w-[110px]">Mandatory</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {/* FIXED tag rows */}
          {fixedTags.map((tag, i) => (
            <tr key={tag.name} className="hover:bg-slate-50/60 transition-colors">
              <td className="px-4 py-3 align-top">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-800">{tag.name}</span>
                  <span className="bg-emerald-100 text-emerald-700 text-xs px-1.5 py-0.5 rounded font-medium">
                    FIXED
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 align-top">
                <MultiSelectDropdown
                  options={FIXED_TAG_DEFS[i].options}
                  selected={tag.selectedValues}
                  onChange={(vals) => onFixedChange(i, { selectedValues: vals })}
                />
              </td>
              <td className="px-4 py-3 align-top text-center">
                <input
                  type="checkbox"
                  checked={tag.isMandatory}
                  onChange={(e) => onFixedChange(i, { isMandatory: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-300 cursor-pointer"
                />
              </td>
            </tr>
          ))}

          {/* FREE_TEXT tag rows */}
          {freeTags.map((tag, i) => (
            <tr key={tag.name} className="hover:bg-slate-50/60 transition-colors">
              <td className="px-4 py-3 align-top">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-800">{tag.name}</span>
                  <span className="bg-violet-100 text-violet-700 text-xs px-1.5 py-0.5 rounded font-medium">
                    FREE_TEXT
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 align-top">
                <ChipTextInput
                  values={tag.values}
                  onChange={(vals) => onFreeChange(i, vals)}
                  placeholder={`Add ${tag.name.toLowerCase()}...`}
                />
              </td>
              <td className="px-4 py-3 align-top text-center">
                <span className="text-slate-300 text-lg select-none">—</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result cards
// ---------------------------------------------------------------------------

function Poc1MediaCard({
  result,
  onImageClick,
}: {
  result: Poc1MediaResult;
  onImageClick: (url: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const fixedTags = result.tags.filter((t) => t.type === 'FIXED');
  const freeTags = result.tags.filter((t) => t.type === 'FREE_TEXT');

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Image — click to enlarge */}
      <div
        className="relative w-full bg-slate-100 cursor-zoom-in"
        style={{ aspectRatio: '16/9' }}
        onClick={() => onImageClick(result.url)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={result.url}
          alt="media result"
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src =
              'https://placehold.co/800x450/e2e8f0/94a3b8?text=Image+Not+Available';
          }}
        />
        <div className="absolute top-2 right-2 bg-indigo-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow">
          Rank: {result.finalRank}
        </div>
        <div className="absolute top-2 left-2 bg-slate-800/70 text-white text-xs px-2 py-1 rounded-full">
          ID: {result.id}
        </div>
        <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-center justify-center">
          <svg className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
          </svg>
        </div>
      </div>

      {/* Summary row */}
      <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-slate-100">
        <div className="min-w-0">
          <p className="text-xs text-slate-500 truncate" title={result.url}>{result.url}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-slate-600">
              VQA: <span className="font-semibold text-slate-800">{result.visualQaScore}</span>
            </span>
            <span className="text-xs text-slate-600">
              Tags: <span className="font-semibold text-slate-800">{result.tags.length}</span>
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors"
        >
          {expanded ? 'Hide Details' : 'View Details'}
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 py-3 space-y-3 bg-slate-50/60">
          {/* Media metadata */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white rounded-lg p-2 border border-slate-100">
              <span className="text-slate-400 block mb-0.5">Media ID</span>
              <span className="font-semibold text-slate-800">{result.id}</span>
            </div>
            <div className="bg-white rounded-lg p-2 border border-slate-100">
              <span className="text-slate-400 block mb-0.5">Visual QA Score</span>
              <span className="font-semibold text-slate-800">{result.visualQaScore}</span>
            </div>
            <div className="bg-white rounded-lg p-2 border border-slate-100">
              <span className="text-slate-400 block mb-0.5">Final Rank</span>
              <span className="font-semibold text-indigo-700">{result.finalRank}</span>
            </div>
            <div className="bg-white rounded-lg p-2 border border-slate-100">
              <span className="text-slate-400 block mb-0.5">Total Tags</span>
              <span className="font-semibold text-slate-800">{result.tags.length}</span>
            </div>
          </div>

          <div className="text-xs">
            <span className="text-slate-400 block mb-1">URL</span>
            <span className="text-slate-700 break-all">{result.url}</span>
          </div>

          {/* Fixed tags */}
          {fixedTags.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Fixed Tags ({fixedTags.length})
              </p>
              <div className="space-y-1">
                {fixedTags.map((t, i) => (
                  <div key={`${t.name}-${i}`} className="flex items-center justify-between bg-white rounded-lg px-3 py-1.5 border border-emerald-100 text-xs">
                    <span className="font-medium text-slate-700">{t.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-700 font-semibold">{t.value}</span>
                      <span className="text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">{t.confidenceLevel}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Free text tags */}
          {freeTags.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Free Text Tags ({freeTags.length})
              </p>
              <div className="space-y-1">
                {freeTags.map((t, i) => (
                  <div key={`${t.name}-${i}`} className="bg-white rounded-lg px-3 py-2 border border-violet-100 text-xs">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-medium text-slate-700">{t.name}</span>
                      <span className="text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">{t.confidenceLevel}</span>
                    </div>
                    <p className="text-violet-700 break-all">{t.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Initial state factories
// ---------------------------------------------------------------------------

function initFixedTags(): FixedTagState[] {
  return FIXED_TAG_DEFS.map((def) => ({
    name: def.name,
    selectedValues: [],
    isMandatory: false,
  }));
}

function initFreeTags(): FreeTextTagState[] {
  return FREE_TEXT_TAG_DEFS.map((def) => ({
    name: def.name,
    values: [],
  }));
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Home() {
  const [selectedModel, setSelectedModel] = useState<PocModelType>(PocModelType.MARIADB_ONLY);

  // Shared tag inputs — same for all models
  const [fixedTags, setFixedTags] = useState<FixedTagState[]>(initFixedTags);
  const [freeTags, setFreeTags] = useState<FreeTextTagState[]>(initFreeTags);
  const [minQaScore, setMinQaScore] = useState<number>(0);

  // Results — unified: poc1Results used for all models
  const [poc1Results, setPoc1Results] = useState<Poc1MediaResult[] | null>(null);

  const [loading, setLoading] = useState(false);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [showMigrateConfirm, setShowMigrateConfirm] = useState(false);
  const [showPocInfo, setShowPocInfo] = useState(false);
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const toastCounter = useRef(0);

  function pushToast(type: 'success' | 'error', message: string) {
    const id = ++toastCounter.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }
  function dismissToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  // ── handlers ──
  function updateFixedTag(index: number, patch: Partial<FixedTagState>) {
    setFixedTags((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }
  function updateFreeTag(index: number, values: string[]) {
    setFreeTags((prev) => prev.map((t, i) => (i === index ? { ...t, values } : t)));
  }

  // ── search ──
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPoc1Results(null);
    setDurationMs(null);
    setLoading(true);

    try {
      const mediaTags = [
        ...fixedTags
          .filter((t) => t.selectedValues.length > 0)
          .map((t) => ({
            name: t.name,
            type: 'FIXED' as const,
            values: t.selectedValues.join(','),
            isMandatory: t.isMandatory,
          })),
        ...freeTags
          .filter((t) => t.values.length > 0)
          .map((t) => ({
            name: t.name,
            type: 'FREE_TEXT' as const,
            values: t.values.join(','),
            isMandatory: false,
          })),
      ];

      if (mediaTags.length === 0) {
        pushToast('error', 'Please select at least one tag value before searching.');
        setLoading(false);
        return;
      }

      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pocModel: selectedModel, mediaTags, minQaScore }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Search failed');

      setDurationMs(data.durationMs ?? null);
      setPoc1Results(data.medias ?? []);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function handleMigrate() {
    setShowMigrateConfirm(false);
    setMigrating(true);
    try {
      const res = await fetch('/api/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Migration failed');
      const lines = (data.results ?? []).map(
        (r: { model: string; success: boolean; error?: string; durationMs: number }) =>
          `${r.model}: ${r.success ? `OK (${r.durationMs}ms)` : `FAILED — ${r.error}`}`
      );
      pushToast('success', lines.join('\n') || 'Migration complete');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Migration failed');
    } finally {
      setMigrating(false);
    }
  }

  const resultCount = poc1Results?.length ?? 0;
  const hasResults = poc1Results !== null;

  // Lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  return (
    <div className="h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex flex-col overflow-hidden">

      {/* ── Migration confirmation modal ── */}
      {showMigrateConfirm && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-800">Run Migration?</h2>
            <p className="text-sm text-slate-600">
              This will <span className="font-semibold text-red-600">drop and recreate all tables</span> and
              re-seed fresh data from <code className="bg-slate-100 px-1 rounded text-xs">seed-data.json</code> for
              all POC models. All existing records will be lost.
            </p>
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setShowMigrateConfirm(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleMigrate}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
              >
                Yes, Run Migration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky navbar */}
      <header className="bg-white border-b border-slate-200 shadow-sm shrink-0">
        <div className="max-w-screen-2xl mx-auto px-6 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-800">Media Search POC</h1>
          <button
            onClick={() => setShowMigrateConfirm(true)}
            disabled={migrating}
            className="bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
          >
            {migrating ? 'Migrating...' : 'Run Migration'}
          </button>
        </div>
      </header>

      {/* Toast notifications */}
      <Toast toasts={toasts} onDismiss={dismissToast} />

      {/* Lightbox overlay */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="enlarged media"
            className="max-w-full max-h-full rounded-xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src =
                'https://placehold.co/1200x675/e2e8f0/94a3b8?text=Image+Not+Available';
            }}
          />
          <button
            className="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/80 rounded-full w-9 h-9 flex items-center justify-center text-xl leading-none transition-colors"
            onClick={() => setLightboxUrl(null)}
          >
            ×
          </button>
        </div>
      )}

      {/* Two-column layout — fills remaining viewport height */}
      <div className="flex-1 flex overflow-hidden max-w-screen-2xl mx-auto w-full gap-0" style={{ minHeight: 0 }}>

        {/* ── Left panel: 60% width, independently scrollable, sticky action bar ── */}
        <div className="w-[60%] shrink-0 flex flex-col border-r border-slate-200" style={{ minHeight: 0 }}>

          {/* Scrollable form content */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        <form id="search-form" onSubmit={handleSearch} className="space-y-4">

          {/* ── 1. Model selector ── */}
          <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">
              1. Select POC Model
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {POC_MODELS.map((m) => (
                <div key={m.value} className="relative group">
                  <label
                    className={`block cursor-pointer border-2 rounded-xl p-4 transition-all ${
                      selectedModel === m.value
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="pocModel"
                      value={m.value}
                      checked={selectedModel === m.value}
                      onChange={() => setSelectedModel(m.value)}
                      className="sr-only"
                    />
                    <div className="font-semibold text-slate-800 text-sm pr-10">{m.label}</div>
                  </label>
                  {/* "What?" button — visible on hover */}
                  <button
                    type="button"
                    onClick={() => { setSelectedModel(m.value); setShowPocInfo(true); }}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold px-2 py-0.5 rounded-md leading-tight"
                  >
                    What?
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* ── POC info modal ── */}
          {showPocInfo && (() => {
            const poc = POC_MODELS.find((m) => m.value === selectedModel)!;
            return (
              <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-6">
                <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="text-base font-bold text-slate-800">{poc.label} — How it works</h2>
                    <button
                      onClick={() => setShowPocInfo(false)}
                      className="shrink-0 text-slate-400 hover:text-slate-600 text-xl leading-none"
                    >
                      ×
                    </button>
                  </div>
                  <ol className="space-y-3">
                    {poc.howItWorks.map((item, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs">
                          {i + 1}
                        </span>
                        <div>
                          <span className="font-semibold text-slate-800">{item.step}</span>
                          <span className="text-slate-500"> — {item.detail}</span>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            );
          })()}

          {/* ── 2. Tag input ── */}
          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
                2. Define Search Tags
              </h2>
              <span className="text-xs text-slate-400">
                Select at least one tag · Mandatory applies to FIXED tags only
              </span>
            </div>
            <Poc1TagMatrix
              fixedTags={fixedTags}
              freeTags={freeTags}
              onFixedChange={updateFixedTag}
              onFreeChange={updateFreeTag}
            />
          </section>

          {/* ── 3. Min QA Score ── */}
          <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">
              3. Quality Filter
            </h2>
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-slate-600 whitespace-nowrap">
                Min QA Score
              </label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={minQaScore}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setMinQaScore(isNaN(v) ? 0 : Math.min(1, Math.max(0, v)));
                }}
                className="w-28 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <span className="text-xs text-slate-400">
                Range 0 – 1 · Results below this threshold will be excluded
              </span>
            </div>
          </section>

        </form>

          </div>{/* end scrollable form area */}

          {/* ── Sticky action bar ── */}
          <div className="shrink-0 border-t border-slate-200 bg-white px-6 py-4 flex gap-3">
            <button
              type="submit"
              form="search-form"
              disabled={loading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-sm"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>

        </div>{/* end left panel */}

        {/* ── Right panel: 40% width, independently scrollable ── */}
        <div className="w-[40%] shrink-0 flex flex-col" style={{ minHeight: 0 }}>

          {/* Results header — sticky within right panel */}
          <div className="shrink-0 px-6 pt-6 pb-3 border-b border-slate-100 bg-slate-50/80">
            <h2 className="text-base font-bold text-slate-800">
              Results
              {hasResults && (
                <span className="ml-2 text-sm font-normal text-slate-500">
                  {resultCount} item{resultCount !== 1 ? 's' : ''}
                  {durationMs !== null ? ` · ${durationMs}ms` : ''}
                  {' · '}{selectedModel}
                </span>
              )}
            </h2>
          </div>

          {/* Scrollable results list */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {!hasResults && (
              <div className="flex flex-col items-center justify-center h-64 text-slate-300">
                <svg className="w-16 h-16 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm">Search results will appear here</p>
              </div>
            )}

            {hasResults && resultCount === 0 && (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm">No media matched your search tags.</p>
              </div>
            )}

            {hasResults && resultCount > 0 && (
              <div className="space-y-4">
                {poc1Results!.map((result) => (
                  <Poc1MediaCard
                    key={result.id}
                    result={result}
                    onImageClick={(url) => setLightboxUrl(url)}
                  />
                ))}
              </div>
            )}
          </div>

        </div>{/* end right panel */}

      </div>{/* end two-column layout */}
    </div>
  );
}
