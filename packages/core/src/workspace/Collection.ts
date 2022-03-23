import * as path from 'path';
import {CollectionConfig} from '../config/CollectionConfig';
import {loadConfigPath} from '../config/loadConfigFile';

export interface CollectionSerialized {
  id: string;
  description?: string;
}

export class Collection {
  id: string;
  config: CollectionConfig;

  constructor(id: string, config: CollectionConfig) {
    this.id = id;
    this.config = config;
  }

  static async init(configPath: string): Promise<Collection> {
    const collectionId = path.parse(configPath).name;
    const config = await loadConfigPath<CollectionConfig>(configPath);
    return new Collection(collectionId, config);
  }

  serialize(): CollectionSerialized {
    return {
      id: this.id,
      description: this.config.description,
    };
  }
}
