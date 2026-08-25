import {useLocalStorage} from './useLocalStorage.js';

/** Document listing density. */
export type Density = 'comfortable' | 'compact';

/**
 * Local storage key for the user's preferred listing density. The preference
 * is global (not per-collection) so that the density stays sticky as the user
 * navigates between collections and opens the doc picker.
 */
const DENSITY_KEY = 'root::CollectionPage:density';

const DEFAULT_DENSITY: Density = 'comfortable';

export interface UseDensityResult {
  /** The density the doc listing should render with. */
  density: Density;
  /**
   * Whether the density is locked by the collection's schema
   * (`viewOptions: {compact: true}`), in which case the user's preference is
   * ignored and any density control should be disabled.
   */
  locked: boolean;
  /** Updates the user's preferred density. */
  setDensity: (density: Density) => void;
}

/**
 * Returns the density to use when rendering a listing of docs for a
 * collection. Collections can force the compact listing via
 * `viewOptions: {compact: true}`; otherwise the user's preferred density is
 * used.
 *
 * Usage:
 * ```tsx
 * const {density, locked, setDensity} = useDensity(collectionId);
 * ```
 */
export function useDensity(collectionId?: string): UseDensityResult {
  const [userDensity, setUserDensity] = useLocalStorage<Density>(
    DENSITY_KEY,
    DEFAULT_DENSITY
  );
  const collection = collectionId
    ? window.__ROOT_CTX.collections[collectionId]
    : null;
  const locked = Boolean(collection?.viewOptions?.compact);
  return {
    density: locked ? 'compact' : userDensity,
    locked: locked,
    setDensity: setUserDensity,
  };
}
