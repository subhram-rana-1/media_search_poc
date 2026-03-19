'use client';

import { useEffect, useRef, useState } from 'react';
import {
  PocModelType,
  SearchTag,
  TagType,
  Weight,
  Poc1MediaResult,
  Poc1ResultTag,
  MediaResult,
} from '@/types';
import { FIXED_TAG_DEFS, FREE_TEXT_TAG_DEFS } from './poc1-tag-definitions';

// ---------------------------------------------------------------------------
// POC model list
// ---------------------------------------------------------------------------

const POC_MODELS: { value: PocModelType; label: string; description: string }[] = [
  {
    value: PocModelType.MARIADB_ONLY,
    label: 'MariaDB Only (POC-1)',
    description: '3-step ranking: fixed tag filter + vector similarity + weighted merge',
  },
  {
    value: PocModelType.MARIADB_QDRANT,
    label: 'MariaDB + Qdrant',
    description: 'Vector similarity search via Qdrant',
  },
  {
    value: PocModelType.MARIADB_ELASTIC,
    label: 'MariaDB + Elasticsearch',
    description: 'Full-text nested tag search via Elasticsearch',
  },
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
// Generic Tag Editor (unchanged — used for Qdrant / Elastic)
// ---------------------------------------------------------------------------

const EMPTY_GENERIC_TAG: SearchTag = {
  name: '',
  type: TagType.FIXED,
  value: '',
  values: [],
  weight: Weight.MEDIUM,
};

function GenericTagEditor({
  tag,
  index,
  onChange,
  onRemove,
}: {
  tag: SearchTag;
  index: number;
  onChange: (index: number, tag: SearchTag) => void;
  onRemove: (index: number) => void;
}) {
  const [valuesInput, setValuesInput] = useState(tag.values.join(', '));

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Tag #{index + 1}
        </span>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="text-red-400 hover:text-red-600 text-sm font-medium transition-colors"
        >
          Remove
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Name *</label>
          <input
            type="text"
            placeholder="e.g. category"
            value={tag.name}
            onChange={(e) => onChange(index, { ...tag, name: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
          <select
            value={tag.type}
            onChange={(e) => onChange(index, { ...tag, type: e.target.value as TagType })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value={TagType.FIXED}>FIXED</option>
            <option value={TagType.FREE_TEXT}>FREE_TEXT</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Value</label>
          <input
            type="text"
            placeholder="e.g. nature"
            value={tag.value}
            onChange={(e) => onChange(index, { ...tag, value: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Weight</label>
          <select
            value={tag.weight}
            onChange={(e) => onChange(index, { ...tag, weight: e.target.value as Weight })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value={Weight.HIGH}>HIGH</option>
            <option value={Weight.MEDIUM}>MEDIUM</option>
            <option value={Weight.LOW}>LOW</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-500 mb-1">Values (comma-separated)</label>
          <input
            type="text"
            placeholder="e.g. nature, landscape"
            value={valuesInput}
            onChange={(e) => {
              setValuesInput(e.target.value);
              const arr = e.target.value.split(',').map((v) => v.trim()).filter(Boolean);
              onChange(index, { ...tag, values: arr });
            }}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result cards
// ---------------------------------------------------------------------------

function Poc1MediaCard({ result }: { result: Poc1MediaResult }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="relative aspect-video bg-slate-100">
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
          Score: {result.finalScore}
        </div>
        <div className="absolute top-2 left-2 bg-slate-800/70 text-white text-xs px-2 py-1 rounded-full">
          ID: {result.id}
        </div>
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="truncate flex-1" title={result.url}>{result.url}</span>
          <span className="ml-2 shrink-0 font-medium text-slate-700">
            VQA: {result.visualQaScore}
          </span>
        </div>
        {result.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {result.tags.map((t: Poc1ResultTag, i: number) => (
              <span
                key={`${t.name}-${t.value}-${i}`}
                className={`text-xs px-2 py-0.5 rounded-full border ${
                  t.type === 'FIXED'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                    : 'bg-violet-50 text-violet-700 border-violet-100'
                }`}
                title={`${t.type} | confidence: ${t.confidenceLevel}`}
              >
                {t.name}: {t.value.length > 30 ? t.value.slice(0, 30) + '...' : t.value}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GenericMediaCard({ result }: { result: MediaResult }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="relative aspect-video bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={result.mediaUrl}
          alt="media result"
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src =
              'https://placehold.co/800x450/e2e8f0/94a3b8?text=Image+Not+Available';
          }}
        />
        <div className="absolute top-2 right-2 bg-indigo-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow">
          {result.score.toFixed(3)}
        </div>
      </div>
      <div className="p-3">
        <p className="text-xs text-slate-400 truncate mb-2" title={result.mediaUrl}>
          {result.mediaUrl}
        </p>
        {result.matchedTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {result.matchedTags.map((t) => (
              <span
                key={t}
                className="bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 rounded-full border border-indigo-100"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
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

  // POC-1 state
  const [fixedTags, setFixedTags] = useState<FixedTagState[]>(initFixedTags);
  const [freeTags, setFreeTags] = useState<FreeTextTagState[]>(initFreeTags);
  const [minQaScore, setMinQaScore] = useState<number>(0);
  const [poc1Results, setPoc1Results] = useState<Poc1MediaResult[] | null>(null);

  // Generic model state
  const [genericTags, setGenericTags] = useState<SearchTag[]>([{ ...EMPTY_GENERIC_TAG }]);
  const [genericResults, setGenericResults] = useState<MediaResult[] | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);

  const isPoc1 = selectedModel === PocModelType.MARIADB_ONLY;

  // ── handlers ──
  function updateFixedTag(index: number, patch: Partial<FixedTagState>) {
    setFixedTags((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }
  function updateFreeTag(index: number, values: string[]) {
    setFreeTags((prev) => prev.map((t, i) => (i === index ? { ...t, values } : t)));
  }

  function addGenericTag() {
    setGenericTags((prev) => [...prev, { ...EMPTY_GENERIC_TAG }]);
  }
  function removeGenericTag(index: number) {
    setGenericTags((prev) => prev.filter((_, i) => i !== index));
  }
  function updateGenericTag(index: number, tag: SearchTag) {
    setGenericTags((prev) => prev.map((t, i) => (i === index ? tag : t)));
  }

  // ── search ──
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPoc1Results(null);
    setGenericResults(null);
    setDurationMs(null);
    setLoading(true);

    try {
      let bodyObj: Record<string, unknown>;

      if (isPoc1) {
        // Build mediaTags only from rows that have values set
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
          setError('Please select at least one tag value before searching.');
          setLoading(false);
          return;
        }

        bodyObj = { pocModel: selectedModel, mediaTags, minQaScore };
      } else {
        const validTags = genericTags.filter((t) => t.name.trim() !== '');
        bodyObj = { pocModel: selectedModel, tags: validTags };
      }

      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyObj),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Search failed');

      setDurationMs(data.durationMs ?? null);
      if (isPoc1) {
        setPoc1Results(data.medias ?? []);
      } else {
        setGenericResults(data.results ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  // ── seed ──
  async function handleSeed() {
    setSeeding(true);
    setSeedResult(null);
    setError(null);
    try {
      const res = await fetch('/api/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel }),
      });
      const data = await res.json();
      const lines = (data.results ?? []).map(
        (r: { model: string; success: boolean; error?: string; durationMs: number }) =>
          `${r.model}: ${r.success ? `OK (${r.durationMs}ms)` : `FAILED — ${r.error}`}`
      );
      setSeedResult(lines.join('\n'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Seed failed');
    } finally {
      setSeeding(false);
    }
  }

  const resultCount = isPoc1 ? poc1Results?.length ?? 0 : genericResults?.length ?? 0;
  const hasResults = isPoc1 ? poc1Results !== null : genericResults !== null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Media Search POC</h1>
            <p className="text-sm text-slate-500">
              Compare search backends: MariaDB · Qdrant · Elasticsearch
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <form onSubmit={handleSearch} className="space-y-6">

          {/* ── 1. Model selector ── */}
          <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">
              1. Select POC Model
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {POC_MODELS.map((m) => (
                <label
                  key={m.value}
                  className={`cursor-pointer border-2 rounded-xl p-4 transition-all ${
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
                  <div className="font-semibold text-slate-800 text-sm">{m.label}</div>
                  <div className="text-xs text-slate-500 mt-1">{m.description}</div>
                </label>
              ))}
            </div>
          </section>

          {/* ── 2. Tag input ── */}
          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
                2. Define Search Tags
              </h2>
              {!isPoc1 && (
                <button
                  type="button"
                  onClick={addGenericTag}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-300 hover:border-indigo-500 px-3 py-1.5 rounded-lg transition-colors"
                >
                  + Add Tag
                </button>
              )}
              {isPoc1 && (
                <span className="text-xs text-slate-400">
                  Select at least one tag · Mandatory applies to FIXED tags only
                </span>
              )}
            </div>

            {isPoc1 ? (
              <Poc1TagMatrix
                fixedTags={fixedTags}
                freeTags={freeTags}
                onFixedChange={updateFixedTag}
                onFreeChange={updateFreeTag}
              />
            ) : (
              <div className="p-6 space-y-3">
                {genericTags.map((tag, i) => (
                  <GenericTagEditor
                    key={i}
                    tag={tag}
                    index={i}
                    onChange={updateGenericTag}
                    onRemove={removeGenericTag}
                  />
                ))}
                {genericTags.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-6">
                    No tags added. Click &quot;Add Tag&quot; to begin.
                  </p>
                )}
              </div>
            )}
          </section>

          {/* ── 3. Min QA Score (POC-1 only) ── */}
          {isPoc1 && (
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
                  Range 0 – 1 · Results with visual QA score below this threshold will be excluded
                </span>
              </div>
            </section>
          )}

          {/* ── Actions ── */}
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold px-8 py-3 rounded-xl transition-colors shadow-sm"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
            <button
              type="button"
              onClick={handleSeed}
              disabled={seeding}
              className="flex-1 sm:flex-none bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-700 font-semibold px-8 py-3 rounded-xl border border-slate-300 transition-colors shadow-sm"
            >
              {seeding ? 'Seeding...' : `Seed "${selectedModel}"`}
            </button>
          </div>
        </form>

        {/* Seed result */}
        {seedResult && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 text-sm text-emerald-800 whitespace-pre font-mono">
            {seedResult}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── Results ── */}
        {hasResults && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800">
                Results
                <span className="ml-2 text-sm font-normal text-slate-500">
                  {resultCount} item{resultCount !== 1 ? 's' : ''}
                  {durationMs !== null ? ` · ${durationMs}ms` : ''}
                  {' · '}{selectedModel}
                </span>
              </h2>
            </div>

            {resultCount === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm">No media matched your search tags.</p>
              </div>
            ) : isPoc1 && poc1Results ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {poc1Results.map((result) => (
                  <Poc1MediaCard key={result.id} result={result} />
                ))}
              </div>
            ) : genericResults ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {genericResults.map((result, i) => (
                  <GenericMediaCard key={i} result={result} />
                ))}
              </div>
            ) : null}
          </section>
        )}
      </main>
    </div>
  );
}
