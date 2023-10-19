/**
 * A trie data structure that stores routes. Supports Next-style routing using
 * [param], [...catchall], and [[...optcatchall]] placeholders.
 */
export class RouteTrie<T> {
  private children: Record<string, RouteTrie<T>> = {};
  private paramNodes?: {[param: string]: ParamNode<T>};
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
        this.paramNodes = {};
      }
      const paramName = head.slice(1, -1);
      if (!this.paramNodes[paramName]) {
        this.paramNodes[paramName] = new ParamNode(paramName);
      }
      nextNode = this.paramNodes[paramName].trie;
    } else {
      nextNode = this.children[head];
      if (!nextNode) {
        nextNode = new RouteTrie();
        this.children[head] = nextNode;
      }
    }
    nextNode.add(tail, route);
  }

  /**
   * Returns a route mapped to the given path and any parameter values from the
   * URL.
   */
  get(path: string): [T | undefined, Record<string, string>] {
    const params = {};
    const route = this.getRoute(path, params);
    return [route, params];
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
    if (this.route) {
      addPromise(cb('/', this.route));
    }
    if (this.paramNodes) {
      Object.values(this.paramNodes).forEach((paramChild) => {
        const param = `[${paramChild.name}]`;
        paramChild.trie.walk((childPath: string, route: T) => {
          const paramUrlPath = `/${param}${childPath}`;
          addPromise(cb(paramUrlPath, route));
        });
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
    for (const subpath of Object.keys(this.children)) {
      const childTrie = this.children[subpath];
      childTrie.walk((childPath: string, childRoute: T) => {
        addPromise(cb(`/${subpath}${childPath}`, childRoute));
      });
    }
    return Promise.all(promises).then(() => {});
  }

  /**
   * Removes all routes from the trie.
   */
  clear() {
    this.children = {};
    this.paramNodes = undefined;
    this.catchAllNodes = undefined;
    this.optCatchAllNodes = undefined;
    this.route = undefined;
  }

  private getRoute(
    urlPath: string,
    params: Record<string, string>
  ): T | undefined {
    urlPath = this.normalizePath(urlPath);
    if (urlPath === '') {
      if (this.route) {
        return this.route;
      }
      if (this.optCatchAllNodes) {
        if (urlPath) {
          params[this.optCatchAllNodes.name] = urlPath;
        }
        return this.optCatchAllNodes.route;
      }
      return undefined;
    }

    const [head, tail] = this.splitPath(urlPath);

    const child = this.children[head];
    if (child) {
      const route = child.getRoute(tail, params);
      if (route) {
        return route;
      }
    }

    if (this.paramNodes) {
      for (const paramChild of Object.values(this.paramNodes)) {
        const route = paramChild.trie.getRoute(tail, params);
        if (route) {
          params[paramChild.name] = head;
          return route;
        }
      }
    }

    if (this.catchAllNodes) {
      params[this.catchAllNodes.name] = urlPath;
      return this.catchAllNodes.route;
    }

    if (this.optCatchAllNodes) {
      params[this.optCatchAllNodes.name] = urlPath;
      return this.optCatchAllNodes.route;
    }

    return undefined;
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
