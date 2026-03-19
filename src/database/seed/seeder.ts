import { SeedMedia } from '@/types';
import { getAllModels } from '@/poc-models/registry';
import seedData from './seed-data.json';

export interface SeedResult {
  model: string;
  success: boolean;
  error?: string;
  durationMs: number;
}

/**
 * Seeds all registered POC models with the data from seed-data.json.
 * Can optionally target a specific model by name.
 */
export async function runSeed(targetModel?: string): Promise<SeedResult[]> {
  const data = seedData as SeedMedia[];
  const models = getAllModels().filter(
    (m) => !targetModel || m.name === targetModel
  );

  const results: SeedResult[] = [];

  for (const model of models) {
    const start = Date.now();
    try {
      await model.seed(data);
      results.push({
        model: model.name,
        success: true,
        durationMs: Date.now() - start,
      });
    } catch (err) {
      results.push({
        model: model.name,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      });
    }
  }

  return results;
}
