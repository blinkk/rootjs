/**
 * A trie data structure that stores routes. Supports Next-style routing using
 * [param], [...catchall], and [[...optcatchall]] placeholders.
 */
export class RouteTrie<T> {
  private children: Map<string, RouteTrie<T>> = new Map();
  private paramNodes?: Map<string, ParamNode<T>>;
  private catchAllNodes?: CatchAllNode<T>;
  private optCatchAllNodes?: CatchAllNode<T>;
  private route?: T;

  /**
   * Adds a route to the trie.
   */
  add(path: string, route: T) {
    path = this.normalizePath(path);

    // If the end was reached, save the value to the node.
    if (path === '') {
      this.route = route;
      return;
    }

    const [head, tail] = this.splitPath(path);

    if (head.startsWith('[[...') && head.endsWith(']]')) {
      const paramName = head.slice(5, -2);
      this.optCatchAllNodes = new CatchAllNode(paramName, route);
      return;
    }
    if (head.startsWith('[...') && head.endsWith(']')) {
      const paramName = head.slice(4, -1);
      this.catchAllNodes = new CatchAllNode(paramName, route);
      return;
    }

    let nextNode: RouteTrie<T>;
    if (head.startsWith('[') && head.endsWith(']')) {
      if (!this.paramNodes) {
        this.paramNodes = new Map();
      }
      const paramName = head.slice(1, -1);
      if (!this.paramNodes.has(paramName)) {
        this.paramNodes.set(paramName, new ParamNode(paramName));
      }
      nextNode = this.paramNodes.get(paramName)!.trie;
    } else {
      nextNode = this.children.get(head)!;
      if (!nextNode) {
        nextNode = new RouteTrie();
        this.children.set(head, nextNode);
      }
    }
    nextNode.add(tail, route);
  }

  /**
   * Returns a route mapped to the given path and any parameter values from the
   * URL.
   */
  get(path: string): [T | undefined, Record<string, string>] {
    const params: Record<string, string> = {};
    const route = this.getRoute(splitSegments(path), 0, params);
    return [route, params];
  }

  /**
   * Returns all routes that match the given path and their parameter values.
   */
  matchAll(path: string): Array<[T, Record<string, string>]> {
    const matches: Array<[T, Record<string, string>]> = [];
    this.collectRoutes(splitSegments(path), 0, {}, matches);
    return matches;
  }

  /**
   * Walks the route trie and calls a callback function for each route.
   */
  walk(cb: (urlPath: string, route: T) => Promise<void> | void): Promise<void> {
    const promises: Array<Promise<void>> = [];
    const addPromise = (promise: Promise<void> | void) => {
      if (promise) {
        promises.push(promise);
      }
    };
    if (this.route !== undefined) {
      addPromise(cb('/', this.route));
    }
    if (this.paramNodes) {
      this.paramNodes.forEach((paramChild) => {
        const param = `[${paramChild.name}]`;
        addPromise(
          paramChild.trie.walk((childPath: string, route: T) => {
            const paramUrlPath = `/${param}${childPath}`;
            return cb(paramUrlPath, route);
          })
        );
      });
    }
    if (this.catchAllNodes) {
      const wildcardUrlPath = `/[...${this.catchAllNodes.name}]`;
      addPromise(cb(wildcardUrlPath, this.catchAllNodes.route));
    }
    if (this.optCatchAllNodes) {
      const wildcardUrlPath = `/[[...${this.optCatchAllNodes.name}]]`;
      addPromise(cb(wildcardUrlPath, this.optCatchAllNodes.route));
    }
    this.children.forEach((childTrie, subpath) => {
      addPromise(
        childTrie.walk((childPath: string, childRoute: T) => {
          return cb(`/${subpath}${childPath}`, childRoute);
        })
      );
    });
    return Promise.all(promises).then(() => {});
  }

  /**
   * Removes all routes from the trie.
   */
  clear() {
    this.children = new Map();
    this.paramNodes = undefined;
    this.catchAllNodes = undefined;
    this.optCatchAllNodes = undefined;
    this.route = undefined;
  }

  private getRoute(
    urlPath: PathSegments,
    index: number,
    params: Record<string, string>
  ): T | undefined {
    const segments = urlPath.segments;
    if (index === segments.length) {
      if (this.route !== undefined) {
        return this.route;
      }
      if (this.optCatchAllNodes) {
        return this.optCatchAllNodes.route;
      }
      return undefined;
    }

    const head = segments[index];
    const nextIndex = index + 1;

    const child = this.children.get(head);
    if (child) {
      const route = child.getRoute(urlPath, nextIndex, params);
      if (route !== undefined) {
        return route;
      }
    }

    if (this.paramNodes) {
      for (const paramChild of this.paramNodes.values()) {
        const route = paramChild.trie.getRoute(urlPath, nextIndex, params);
        if (route !== undefined) {
          params[paramChild.name] = head;
          return route;
        }
      }
    }

    if (this.catchAllNodes) {
      params[this.catchAllNodes.name] = restOfPath(urlPath, index);
      return this.catchAllNodes.route;
    }

    if (this.optCatchAllNodes) {
      params[this.optCatchAllNodes.name] = restOfPath(urlPath, index);
      return this.optCatchAllNodes.route;
    }

    return undefined;
  }

  private collectRoutes(
    urlPath: PathSegments,
    index: number,
    params: Record<string, string>,
    results: Array<[T, Record<string, string>]>
  ) {
    const segments = urlPath.segments;
    if (index === segments.length) {
      if (this.route !== undefined) {
        results.push([this.route, {...params}]);
      }
      if (this.optCatchAllNodes) {
        results.push([this.optCatchAllNodes.route, {...params}]);
      }
      return;
    }

    const head = segments[index];
    const nextIndex = index + 1;

    const child = this.children.get(head);
    if (child) {
      child.collectRoutes(urlPath, nextIndex, params, results);
    }

    if (this.paramNodes) {
      for (const paramChild of this.paramNodes.values()) {
        const paramParams = {...params, [paramChild.name]: head};
        paramChild.trie.collectRoutes(urlPath, nextIndex, paramParams, results);
      }
    }

    if (this.catchAllNodes) {
      const rest = restOfPath(urlPath, index);
      const caParams = {...params, [this.catchAllNodes.name]: rest};
      results.push([this.catchAllNodes.route, caParams]);
    }

    if (this.optCatchAllNodes) {
      const rest = restOfPath(urlPath, index);
      const ocParams = {...params, [this.optCatchAllNodes.name]: rest};
      results.push([this.optCatchAllNodes.route, ocParams]);
    }
  }

  /**
   * Normalizes a path for inclusion into the route trie.
   */
  private normalizePath(path: string) {
    // Remove leading/trailing slashes.
    return path.replace(/^\/+/g, '').replace(/\/+$/g, '');
  }

  /**
   * Splits the parent directory from its children, e.g.:
   *
   *     splitPath("foo/bar/baz") -> ["foo", "bar/baz"]
   */
  private splitPath(path: string): [string, string] {
    const i = path.indexOf('/');
    if (i === -1) {
      return [path, ''];
    }
    return [path.slice(0, i), path.slice(i + 1)];
  }
}

const SLASH_CHAR_CODE = 47;

/**
 * A URL path that has been split into its non-empty path segments.
 */
interface PathSegments {
  /** The original URL path. */
  path: string;
  /** The non-empty path segments. */
  segments: string[];
  /** The offset within `path` where each segment starts. */
  starts: number[];
  /** The offset within `path` where the last segment ends. */
  end: number;
}

/**
 * Splits a URL path into non-empty path segments, stripping leading, trailing,
 * and repeated slashes without regex allocations.
 */
function splitSegments(urlPath: string): PathSegments {
  const segments: string[] = [];
  const starts: number[] = [];
  const len = urlPath.length;
  let start = 0;
  let lastEnd = 0;
  while (start < len) {
    while (start < len && urlPath.charCodeAt(start) === SLASH_CHAR_CODE) {
      start++;
    }
    if (start >= len) {
      break;
    }
    let end = urlPath.indexOf('/', start);
    if (end === -1) {
      end = len;
    }
    segments.push(urlPath.slice(start, end));
    starts.push(start);
    lastEnd = end;
    start = end + 1;
  }
  return {path: urlPath, segments, starts, end: lastEnd};
}

/**
 * Returns the remainder of the URL path starting at the given segment, used as
 * the value of catch-all params. Repeated slashes between the remaining
 * segments are preserved (e.g. `a//b`).
 */
function restOfPath(urlPath: PathSegments, index: number): string {
  return urlPath.path.slice(urlPath.starts[index], urlPath.end);
}

/**
 * A node in the RouteTrie for a :param child.
 */
class ParamNode<T> {
  readonly name: string;
  readonly trie: RouteTrie<T> = new RouteTrie();

  constructor(name: string) {
    this.name = name;
  }
}

/**
 * A node in the RouteTrie for a *wildcard child.
 */
class CatchAllNode<T> {
  readonly name: string;
  readonly route: T;

  constructor(name: string, route: T) {
    this.name = name;
    this.route = route;
  }
}
