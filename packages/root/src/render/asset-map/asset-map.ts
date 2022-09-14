export interface Asset {
  moduleId: string;
  assetUrl: string;
  getCssDeps(): Promise<string[]>;
  getJsDeps(): Promise<string[]>;
}

export interface AssetMap {
  get: (moduleId: string) => Promise<Asset | null>;
}
