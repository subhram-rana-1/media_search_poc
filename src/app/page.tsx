'use client';

import { useState } from 'react';
import {
  PocModelType,
  SearchTag,
  TagType,
  Weight,
  SearchResponse,
  MediaResult,
} from '@/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POC_MODELS: { value: PocModelType; label: string; description: string }[] = [
  {
    value: PocModelType.MARIADB_ONLY,
    label: 'MariaDB Only',
    description: 'SQL tag matching with weighted scoring',
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

const EMPTY_TAG: SearchTag = {
  name: '',
  type: TagType.FIXED,
  value: '',
  values: [],
  weight: Weight.MEDIUM,
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TagEditor({
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

  function update(field: keyof SearchTag, val: string) {
    if (field === 'values') {
      const arr = val
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
      onChange(index, { ...tag, values: arr });
    } else {
      onChange(index, { ...tag, [field]: val });
    }
  }

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
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Name *
          </label>
          <input
            type="text"
            placeholder="e.g. category"
            value={tag.name}
            onChange={(e) => update('name', e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        {/* Type */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Type
          </label>
          <select
            value={tag.type}
            onChange={(e) => update('type', e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          >
            <option value={TagType.FIXED}>FIXED</option>
            <option value={TagType.FREE_TEXT}>FREE_TEXT</option>
          </select>
        </div>

        {/* Value */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Value
          </label>
          <input
            type="text"
            placeholder="e.g. nature"
            value={tag.value}
            onChange={(e) => update('value', e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        {/* Weight */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Weight
          </label>
          <select
            value={tag.weight}
            onChange={(e) => update('weight', e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          >
            <option value={Weight.HIGH}>HIGH</option>
            <option value={Weight.MEDIUM}>MEDIUM</option>
            <option value={Weight.LOW}>LOW</option>
          </select>
        </div>

        {/* Values (comma-separated) */}
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Values (comma-separated)
          </label>
          <input
            type="text"
            placeholder="e.g. nature, landscape, forest"
            value={valuesInput}
            onChange={(e) => {
              setValuesInput(e.target.value);
              update('values', e.target.value);
            }}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
      </div>
    </div>
  );
}

function MediaCard({ result }: { result: MediaResult }) {
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
// Main page
// ---------------------------------------------------------------------------

export default function Home() {
  const [selectedModel, setSelectedModel] = useState<PocModelType>(
    PocModelType.MARIADB_ONLY
  );
  const [tags, setTags] = useState<SearchTag[]>([{ ...EMPTY_TAG }]);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);

  function addTag() {
    setTags((prev) => [...prev, { ...EMPTY_TAG }]);
  }

  function removeTag(index: number) {
    setTags((prev) => prev.filter((_, i) => i !== index));
  }

  function updateTag(index: number, tag: SearchTag) {
    setTags((prev) => prev.map((t, i) => (i === index ? tag : t)));
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResponse(null);
    setLoading(true);

    const validTags = tags.filter((t) => t.name.trim() !== '');

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pocModel: selectedModel, tags: validTags }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Search failed');
      setResponse(data as SearchResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Media Search POC</h1>
            <p className="text-sm text-slate-500">Compare search backends: MariaDB · Qdrant · Elasticsearch</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <form onSubmit={handleSearch} className="space-y-6">
          {/* Model selector */}
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

          {/* Tag builder */}
          <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
                2. Define Search Tags
              </h2>
              <button
                type="button"
                onClick={addTag}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-300 hover:border-indigo-500 px-3 py-1.5 rounded-lg transition-colors"
              >
                + Add Tag
              </button>
            </div>

            <div className="space-y-3">
              {tags.map((tag, i) => (
                <TagEditor
                  key={i}
                  tag={tag}
                  index={i}
                  onChange={updateTag}
                  onRemove={removeTag}
                />
              ))}
              {tags.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">
                  No tags added. Click &quot;Add Tag&quot; to begin, or search with no tags to return all media.
                </p>
              )}
            </div>
          </section>

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold px-8 py-3 rounded-xl transition-colors shadow-sm"
            >
              {loading ? 'Searching…' : 'Search'}
            </button>

            <button
              type="button"
              onClick={handleSeed}
              disabled={seeding}
              className="flex-1 sm:flex-none bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-700 font-semibold px-8 py-3 rounded-xl border border-slate-300 transition-colors shadow-sm"
            >
              {seeding ? 'Seeding…' : `Seed "${selectedModel}"`}
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

        {/* Results */}
        {response && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800">
                Results
                <span className="ml-2 text-sm font-normal text-slate-500">
                  {response.results.length} item{response.results.length !== 1 ? 's' : ''} · {response.durationMs}ms · {response.pocModel}
                </span>
              </h2>
            </div>

            {response.results.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm">No media matched your search tags.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {response.results.map((result, i) => (
                  <MediaCard key={i} result={result} />
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
