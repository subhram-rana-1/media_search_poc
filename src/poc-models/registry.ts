import { PocModelType } from '@/types';
import { IPocModel } from './base';
import { MariaDbOnlyModel } from './mariadb-only.model';
import { MariaDbQdrantModel } from './mariadb-qdrant.model';
import { MariaDbElasticModel } from './mariadb-elastic.model';

const registry: Record<PocModelType, IPocModel> = {
  [PocModelType.MARIADB_ONLY]: new MariaDbOnlyModel(),
  [PocModelType.MARIADB_QDRANT]: new MariaDbQdrantModel(),
  [PocModelType.MARIADB_ELASTIC]: new MariaDbElasticModel(),
};

export function getModel(pocModel: PocModelType): IPocModel {
  const model = registry[pocModel];
  if (!model) {
    throw new Error(
      `Unknown pocModel: "${pocModel}". Valid values: ${Object.values(PocModelType).join(', ')}`
    );
  }
  return model;
}

export function getAllModels(): IPocModel[] {
  return Object.values(registry);
}
