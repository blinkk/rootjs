declare module 'virtual:root-elements' {
  interface ElementModule {
    src: string;
    filePath: string;
    realPath: string;
  }
  export const elementsMap: Record<string, ElementModule>;
}
