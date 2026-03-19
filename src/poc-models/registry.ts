import { PocModelType } from '@/types';
import { IPocModel } from './base';
import { MariaDbOnlyModel } from './mariadb-only.model';

// Qdrant and Elasticsearch models are excluded until those services are needed.
const registry: Partial<Record<PocModelType, IPocModel>> = {
  [PocModelType.MARIADB_ONLY]: new MariaDbOnlyModel(),
};

export function getModel(pocModel: PocModelType): IPocModel {
  const model = registry[pocModel];
  if (!model) {
    throw new Error(
      `Model "${pocModel}" is not available. Currently active: ${Object.keys(registry).join(', ')}`
    );
  }
  return model;
}

export function getAllModels(): IPocModel[] {
  return Object.values(registry) as IPocModel[];
}
