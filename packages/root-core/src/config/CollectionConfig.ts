export interface CollectionConfig {
  /**
   * Descriptive text about a collection.
   */
  description?: string;
}

/**
 * Helper function for defining a collection config with type checking.
 */
export function defineCollection(config: CollectionConfig) {
  return config;
}
