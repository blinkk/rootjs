/**
 * A trie data structure that stores routes. The trie supports `:param` and
 * `*wildcard` values.
 */
export class RouteTrie<T> {
  private children: Record<string, RouteTrie<T>> = {};
  private paramChildren?: {[param: string]: ParamChild<T>};
  private wildcardChild?: WildcardChild<T>;
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
    if (head.startsWith('[...') && head.endsWith(']')) {
      const paramName = head.slice(4, -1);
      this.wildcardChild = new WildcardChild(paramName, route);
      return;
    }

    let nextNode: RouteTrie<T>;
    if (head.startsWith('[') && head.endsWith(']')) {
      if (!this.paramChildren) {
        this.paramChildren = {};
      }
      const paramName = head.slice(1, -1);
      if (!this.paramChildren[paramName]) {
        this.paramChildren[paramName] = new ParamChild(paramName);
      }
      nextNode = this.paramChildren[paramName].trie;
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
    if (this.paramChildren) {
      Object.values(this.paramChildren).forEach((paramChild) => {
        const param = `[${paramChild.name}]`;
        paramChild.trie.walk((childPath: string, route: T) => {
          const paramUrlPath = `/${param}${childPath}`;
          addPromise(cb(paramUrlPath, route));
        });
      });
    }
    if (this.wildcardChild) {
      const wildcardUrlPath = `/[...${this.wildcardChild.name}]`;
      addPromise(cb(wildcardUrlPath, this.wildcardChild.route));
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
    this.paramChildren = undefined;
    this.wildcardChild = undefined;
    this.route = undefined;
  }

  private getRoute(
    urlPath: string,
    params: Record<string, string>
  ): T | undefined {
    urlPath = this.normalizePath(urlPath);
    if (urlPath === '') {
      return this.route;
    }

    const [head, tail] = this.splitPath(urlPath);

    const child = this.children[head];
    if (child) {
      const route = child.getRoute(tail, params);
      if (route) {
        return route;
      }
    }

    if (this.paramChildren) {
      for (const paramChild of Object.values(this.paramChildren)) {
        const route = paramChild.trie.getRoute(tail, params);
        if (route) {
          params[paramChild.name] = head;
          return route;
        }
      }
    }

    if (this.wildcardChild) {
      params[this.wildcardChild.name] = urlPath;
      return this.wildcardChild.route;
    }

    return undefined;
  }

  /**
   * Normalizes a path for inclusion into the route trie.
   */
  private normalizePath(path: string) {
    // Remove leading slashes.
    return path.replace(/^\/+/g, '');
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
class ParamChild<T> {
  readonly name: string;
  readonly trie: RouteTrie<T> = new RouteTrie();

  constructor(name: string) {
    this.name = name;
  }
}

/**
 * A node in the RouteTrie for a *wildcard child.
 */
class WildcardChild<T> {
  readonly name: string;
  readonly route: T;

  constructor(name: string, route: T) {
    this.name = name;
    this.route = route;
  }
}
