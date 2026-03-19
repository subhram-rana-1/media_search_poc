import { MediaResult, PocModelType, SearchTag, SeedMedia } from '@/types';

/**
 * Every POC model must implement this interface.
 * The API layer only depends on this contract — it never imports a concrete model directly.
 */
export interface IPocModel {
  readonly name: PocModelType;

  /**
   * Search for media matching the provided tags.
   * Returns results sorted by descending relevance score.
   */
  search(tags: SearchTag[]): Promise<MediaResult[]>;

  /**
   * Seed the underlying database(s) with media data from the JSON file.
   * Implementations should be idempotent (upsert, not duplicate).
   */
  seed(data: SeedMedia[]): Promise<void>;
}
