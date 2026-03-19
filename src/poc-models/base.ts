import { PocModelType, SeedMedia } from '@/types';

/**
 * Every POC model must implement this interface.
 * The API layer only depends on this contract — it never imports a concrete model directly.
 *
 * `search` and its return type are intentionally `unknown` because each POC model
 * may define its own input tag shape and result shape.
 */
export interface IPocModel {
  readonly name: PocModelType;

  search(tags: unknown[]): Promise<unknown>;

  seed(data: SeedMedia[]): Promise<void>;

  /**
   * Full migration: drop all tables → recreate schema → seed with fresh data.
   */
  migrate(data: SeedMedia[]): Promise<void>;
}
