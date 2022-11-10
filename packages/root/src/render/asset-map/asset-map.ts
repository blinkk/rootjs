export interface Asset {
  /**
   * The path to the asset's src file, relative to the project root.
   */
  src: string;

  /**
   * The serving URL for the asset.
   */
  assetUrl: string;

  /**
   * Recursively walks all deps and returns a list of CSS asset URLs.
   */
  getCssDeps(): Promise<string[]>;

  /**
   * Recursively walks all deps and returns a list of JS asset URLs.
   */
  getJsDeps(): Promise<string[]>;
}

export interface AssetMap {
  /**
   * Returns the asset for a given src file. The `src` value should be a path
   * relative to the project root, e.g. "routes/index.tsx".
   */
  get: (src: string) => Promise<Asset | null>;
}
