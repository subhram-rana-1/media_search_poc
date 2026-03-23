'use client';

import { useEffect, useRef, useState } from 'react';
import {
  PocModelType,
  Poc1MediaResult,
  Poc1SearchTag,
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
  {
    value: PocModelType.MARIADB_QDRANT,
    label: 'Qdrant Only',
    howItWorks: [
      { step: 'Mandatory fixed-tag filter', detail: 'Hard-filters Qdrant points using payload integer indexes on mandatory fixed tags — no DB round-trip.' },
      { step: 'Free-text vector search', detail: 'Builds a combined paragraph from all free-text inputs, embeds it with OpenAI, and performs cosine similarity search in Qdrant.' },
      { step: 'Optional fixed-tag scoring', detail: 'Scores the 50 filtered candidates by how many optional fixed tags match (read directly from Qdrant payload — no DB call).' },
      { step: 'Weighted rank merge', detail: 'Combines vector similarity rank and optional-tag match rank (50/50) into a final score.' },
      { step: 'Top-5 results returned', detail: 'Returns top 5 results sorted by final rank, tiebroken by visual QA score.' },
    ],
  },
  {
    value: PocModelType.MARIADB_QDRANT_HYBRID,
    label: 'MariaDB + Qdrant Hybrid',
    howItWorks: [
      { step: 'Mandatory fixed-tag filter (MariaDB)', detail: 'SQL query on one_media_fixed_tag to hard-filter candidates by all mandatory fixed tags.' },
      { step: 'Optional fixed-tag scoring (MariaDB)', detail: 'Counts how many optional fixed tags each candidate matches to produce rank_1.' },
      { step: 'Free-text vector search (Qdrant)', detail: 'Builds a combined paragraph from free-text inputs, embeds it, and searches the poc3 Qdrant collection scoped to step-1 candidates for rank_2.' },
      { step: 'Weighted rank merge', detail: 'Combines rank_1 and rank_2 with equal 50/50 weight into a final score.' },
      { step: 'Top-5 results returned', detail: 'Sorted by final rank, tiebroken by visual QA score descending.' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Per-model result types
// ---------------------------------------------------------------------------

type ModelResult = {
  medias: Poc1MediaResult[];
  durationMs: number;
};

type ModelStatus = 'idle' | 'loading' | 'success' | 'error';

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
// Chip text input component
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
// Spinner helper
// ---------------------------------------------------------------------------

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className ?? 'w-4 h-4'}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const INIT_MODEL_STATUS: Record<PocModelType, ModelStatus> = {
  [PocModelType.MARIADB_ONLY]: 'idle',
  [PocModelType.MARIADB_QDRANT]: 'idle',
  [PocModelType.MARIADB_QDRANT_HYBRID]: 'idle',
  [PocModelType.MARIADB_ELASTIC]: 'idle',
};

export default function Home() {
  // ── Per-model state ──
  const [activeTab, setActiveTab] = useState<PocModelType>(PocModelType.MARIADB_ONLY);
  const [modelResults, setModelResults] = useState<Partial<Record<PocModelType, ModelResult>>>({});
  const [modelStatus, setModelStatus] = useState<Record<PocModelType, ModelStatus>>(INIT_MODEL_STATUS);
  const [modelErrors, setModelErrors] = useState<Partial<Record<PocModelType, string>>>({});

  // ── Shared form state ──
  const [fixedTags, setFixedTags] = useState<FixedTagState[]>(initFixedTags);
  const [freeTags, setFreeTags] = useState<FreeTextTagState[]>(initFreeTags);
  const [minQaScore, setMinQaScore] = useState<number>(0);

  // ── UI state ──
  const [migrating, setMigrating] = useState(false);
  const [showMigrateConfirm, setShowMigrateConfirm] = useState(false);
  const [infoModel, setInfoModel] = useState<PocModelType | null>(null);
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const toastCounter = useRef(0);

  // Stores the last search input for the download JSON
  const lastSearchInput = useRef<{ mediaTags: Poc1SearchTag[]; minQaScore: number } | null>(null);

  // ── Derived ──
  const isAnyLoading = POC_MODELS.some((m) => modelStatus[m.value] === 'loading');
  const allModelsSuccess = POC_MODELS.every((m) => modelStatus[m.value] === 'success');
  const hasAnySearchStarted = POC_MODELS.some((m) => modelStatus[m.value] !== 'idle');

  const activeResult = modelResults[activeTab];
  const activeStatus = modelStatus[activeTab];
  const activeError = modelErrors[activeTab];

  // ── Toast helpers ──
  function pushToast(type: 'success' | 'error', message: string) {
    const id = ++toastCounter.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }
  function dismissToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  // ── Tag handlers ──
  function updateFixedTag(index: number, patch: Partial<FixedTagState>) {
    setFixedTags((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }
  function updateFreeTag(index: number, values: string[]) {
    setFreeTags((prev) => prev.map((t, i) => (i === index ? { ...t, values } : t)));
  }

  // ── Search: fires all POC model APIs in parallel ──
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();

    const mediaTags: Poc1SearchTag[] = [
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
      return;
    }

    // Reset all models to loading
    const loadingStatus = POC_MODELS.reduce((acc, m) => {
      acc[m.value] = 'loading';
      return acc;
    }, { ...INIT_MODEL_STATUS });

    setModelResults({});
    setModelErrors({});
    setModelStatus(loadingStatus);
    setActiveTab(PocModelType.MARIADB_ONLY);
    lastSearchInput.current = { mediaTags, minQaScore };

    // Track first successful model to auto-switch tab
    let firstSuccessSet = false;

    const promises = POC_MODELS.map((m) =>
      fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pocModel: m.value, mediaTags, minQaScore }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? 'Search failed');
          setModelResults((prev) => ({
            ...prev,
            [m.value]: { medias: data.medias ?? [], durationMs: data.durationMs ?? 0 },
          }));
          setModelStatus((prev) => ({ ...prev, [m.value]: 'success' }));
          if (!firstSuccessSet) {
            firstSuccessSet = true;
            setActiveTab(m.value);
          }
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : 'Search failed';
          setModelStatus((prev) => ({ ...prev, [m.value]: 'error' }));
          setModelErrors((prev) => ({ ...prev, [m.value]: msg }));
          pushToast('error', `${m.label}: ${msg}`);
        })
    );

    await Promise.allSettled(promises);
  }

  // ── Download all results as JSON ──
  function handleDownload() {
    if (!lastSearchInput.current) return;

    const resultsPayload: Record<string, { durationMs: number; medias: Poc1MediaResult[] }> = {};
    for (const m of POC_MODELS) {
      const r = modelResults[m.value];
      if (r) resultsPayload[m.value] = r;
    }

    const payload = {
      searchInput: lastSearchInput.current,
      results: resultsPayload,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `media-search-results-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Migrate ──
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

  // ── Tab styling helper ──
  function getTabClasses(modelValue: PocModelType): string {
    const status = modelStatus[modelValue];
    const isActive = activeTab === modelValue;

    if (isActive) {
      if (status === 'error') return 'bg-red-600 text-white border-red-500';
      return 'bg-indigo-600 text-white border-indigo-500';
    }

    switch (status) {
      case 'success': return 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200 cursor-pointer';
      case 'loading': return 'bg-amber-50 text-amber-600 border-amber-200 cursor-default';
      case 'error':   return 'bg-red-50 text-red-500 border-red-200 hover:bg-red-100 cursor-pointer';
      default:        return 'bg-slate-100 text-slate-400 border-slate-200 cursor-default';
    }
  }

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

      {/* ── POC info modal ── */}
      {infoModel !== null && (() => {
        const poc = POC_MODELS.find((m) => m.value === infoModel)!;
        return (
          <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-6">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-base font-bold text-slate-800">{poc.label} — How it works</h2>
                <button
                  onClick={() => setInfoModel(null)}
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

              {/* ── 1. Tag input ── */}
              <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
                    1. Define Search Tags
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

              {/* ── 2. Min QA Score ── */}
              <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">
                  2. Quality Filter
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
          </div>

          {/* ── Sticky action bar ── */}
          <div className="shrink-0 border-t border-slate-200 bg-white px-6 py-4 flex gap-3">
            <button
              type="submit"
              form="search-form"
              disabled={isAnyLoading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2"
            >
              {isAnyLoading ? (
                <>
                  <Spinner className="w-4 h-4" />
                  Searching...
                </>
              ) : (
                'Search'
              )}
            </button>
          </div>

        </div>{/* end left panel */}

        {/* ── Right panel: 40% width, independently scrollable ── */}
        <div className="w-[40%] shrink-0 flex flex-col" style={{ minHeight: 0 }}>

          {/* ── Results header + Tab bar ── */}
          <div className="shrink-0 bg-white border-b border-slate-200">

            {/* Title row + download button */}
            <div className="px-6 pt-4 pb-2 flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-slate-800">Results</h2>
              {allModelsSuccess && (
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download JSON
                </button>
              )}
            </div>

            {/* Tab strip */}
            <div className="px-4 flex gap-1 items-end">
              {POC_MODELS.map((m) => {
                const status = modelStatus[m.value];
                const isActive = activeTab === m.value;
                const isClickable = status === 'success' || status === 'error' || isActive;

                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => isClickable && setActiveTab(m.value)}
                    className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg border border-b-0 transition-all select-none ${getTabClasses(m.value)}`}
                  >
                    {/* Status icon */}
                    {status === 'loading' && <Spinner className="w-3 h-3" />}
                    {status === 'success' && !isActive && (
                      <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {status === 'error' && (
                      <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}

                    <span>{m.label}</span>

                    {/* "?" info button */}
                    <span
                      role="button"
                      title={`How ${m.label} works`}
                      onClick={(e) => { e.stopPropagation(); setInfoModel(m.value); }}
                      className={`w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0 transition-colors ${
                        isActive
                          ? 'bg-white/20 text-white hover:bg-white/40'
                          : 'bg-slate-200/80 text-slate-500 hover:bg-slate-300'
                      }`}
                    >
                      ?
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Active tab stats */}
            <div className="px-6 py-2 min-h-[32px] flex items-center">
              {activeResult && (
                <span className="text-xs text-slate-500">
                  {activeResult.medias.length} item{activeResult.medias.length !== 1 ? 's' : ''} · {activeResult.durationMs}ms
                </span>
              )}
              {!activeResult && activeStatus === 'loading' && (
                <span className="text-xs text-amber-500 flex items-center gap-1.5">
                  <Spinner className="w-3 h-3" />
                  Running search...
                </span>
              )}
              {!activeResult && activeStatus === 'error' && (
                <span className="text-xs text-red-500 truncate">{activeError ?? 'Search failed'}</span>
              )}
              {!activeResult && activeStatus === 'idle' && (
                <span className="text-xs text-slate-400">Search results will appear here</span>
              )}
            </div>
          </div>

          {/* Scrollable results list */}
          <div className="flex-1 overflow-y-auto px-6 py-4">

            {/* Pre-search placeholder */}
            {!hasAnySearchStarted && (
              <div className="flex flex-col items-center justify-center h-64 text-slate-300">
                <svg className="w-16 h-16 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm">Search results will appear here</p>
              </div>
            )}

            {/* Loading state for this tab */}
            {hasAnySearchStarted && activeStatus === 'loading' && (
              <div className="flex flex-col items-center justify-center h-64 text-amber-400 gap-3">
                <Spinner className="w-10 h-10" />
                <p className="text-sm text-slate-400">Searching with {POC_MODELS.find(m => m.value === activeTab)?.label}...</p>
              </div>
            )}

            {/* Error state for this tab */}
            {hasAnySearchStarted && activeStatus === 'error' && (
              <div className="flex flex-col items-center justify-center h-64 gap-3">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-red-600 mb-1">Search failed</p>
                  <p className="text-xs text-slate-400 max-w-[260px] break-words">{activeError}</p>
                </div>
              </div>
            )}

            {/* No results */}
            {hasAnySearchStarted && activeStatus === 'success' && activeResult?.medias.length === 0 && (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm">No media matched your search tags.</p>
              </div>
            )}

            {/* Results cards */}
            {hasAnySearchStarted && activeStatus === 'success' && activeResult && activeResult.medias.length > 0 && (
              <div className="space-y-4">
                {activeResult.medias.map((result) => (
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
