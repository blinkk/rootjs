// NOTE(stevenle): The package.json in preact-router doesn't correctly tag
// the types, so we copy/paste the type definitions here.
//
// Files included:
// node_modules/preact-router/index.d.ts
// node_modules/preact-router/match/index.d.ts

declare module 'preact-router' {
  export function route(url: string, replace?: boolean): boolean;
  export function route(options: {url: string; replace?: boolean}): boolean;

  export function getCurrentUrl(): string;

  export interface Location {
    pathname: string;
    search: string;
  }

  export interface CustomHistory {
    listen(callback: (location: Location) => void): () => void;
    location: Location;
    push(path: string): void;
    replace(path: string): void;
  }

  export interface RoutableProps {
    path?: string;
    default?: boolean;
  }

  export interface RouterOnChangeArgs<
    RouteParams extends Record<string, string | undefined> | null = Record<
      string,
      string | undefined
    > | null
  > {
    router: Router;
    url: string;
    previous?: string;
    active: preact.VNode[];
    current: preact.VNode;
    path: string | null;
    matches: RouteParams;
  }

  export interface RouterProps<
    RouteParams extends Record<string, string | undefined> | null = Record<
      string,
      string | undefined
    > | null
  > extends RoutableProps {
    history?: CustomHistory;
    static?: boolean;
    url?: string;
    onChange?: (args: RouterOnChangeArgs<RouteParams>) => void;
  }

  export class Router extends preact.Component<RouterProps, {}> {
    canRoute(url: string): boolean;
    getMatchingChildren(
      children: preact.VNode[],
      url: string,
      invoke: boolean
    ): preact.VNode[];
    routeTo(url: string): boolean;
    render(props: RouterProps): preact.VNode;
  }

  type AnyComponent<Props> =
    | preact.FunctionalComponent<Props>
    | preact.ComponentConstructor<Props, any>;

  export interface RouteProps<Props> extends RoutableProps {
    component: AnyComponent<Props>;
  }

  export function Route<Props>(
    props: RouteProps<Props> & Partial<Props>
  ): preact.VNode;

  export function Link(
    props: {activeClassName?: string} & preact.JSX.HTMLAttributes
  ): preact.VNode;

  export function useRouter<
    RouteParams extends Record<string, string | undefined> | null = Record<
      string,
      string | undefined
    > | null
  >(): [
    RouterOnChangeArgs<RouteParams>,
    (
      urlOrOptions: string | {url: string; replace?: boolean},
      replace?: boolean
    ) => boolean
  ];

  export default Router;
}

declare module 'preact-router/match' {
  export interface LinkProps extends preact.JSX.HTMLAttributes {
    activeClassName?: string;
    children?: preact.ComponentChildren;
  }

  export function Link(props: LinkProps): preact.VNode;
}
