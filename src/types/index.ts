export enum TagType {
  FIXED = 'FIXED',
  FREE_TEXT = 'FREE_TEXT',
}

export enum ConfidenceLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum Weight {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum PocModelType {
  MARIADB_ONLY = 'mariadb-only',
  MARIADB_QDRANT = 'mariadb-qdrant',
  MARIADB_ELASTIC = 'mariadb-elastic',
}

// ---------------------------------------------------------------------------
// Seed data structures (matches the input JSON file format)
// ---------------------------------------------------------------------------

export interface SeedTag {
  name: string;
  type: TagType;
  value: string;
  values: string[];
  confidenceLevel: ConfidenceLevel;
}

export interface SeedMedia {
  mediaUrl: string;
  visualQaScore: number;
  tags: SeedTag[];
}

// ---------------------------------------------------------------------------
// Generic API search input/output (used by Qdrant / Elastic POC models)
// ---------------------------------------------------------------------------

export interface SearchTag {
  name: string;
  type: TagType;
  value: string;
  values: string[];
  weight: Weight;
}

export interface SearchRequest {
  pocModel: PocModelType;
  tags: SearchTag[];
}

export interface MediaResult {
  mediaUrl: string;
  score: number;
  matchedTags: string[];
}

export interface SearchResponse {
  results: MediaResult[];
  pocModel: PocModelType;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// POC-1 (MariaDB-only) — model-specific API contract
// ---------------------------------------------------------------------------

export interface Poc1SearchTag {
  name: string;
  type: 'FIXED' | 'FREE_TEXT';
  values: string;           // comma-separated (e.g. "morning,evening")
  isMandatory?: boolean;    // only valid when type=FIXED; 400 if true on FREE_TEXT
}

export interface Poc1SearchRequest {
  pocModel: PocModelType;
  mediaTags: Poc1SearchTag[];
  minQaScore?: number;   // 0–1, applied after final ranking to filter out low-quality results
}

export interface Poc1ResultTag {
  name: string;
  type: string;
  value: string;
  confidenceLevel: string;
}

export interface Poc1MediaResult {
  id: number;
  url: string;
  visualQaScore: number;
  tags: Poc1ResultTag[];
  finalScore: number;
}

export interface Poc1SearchResponse {
  medias: Poc1MediaResult[];
}
