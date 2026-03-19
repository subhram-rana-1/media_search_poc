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
// API search input
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

// ---------------------------------------------------------------------------
// API search output
// ---------------------------------------------------------------------------

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
