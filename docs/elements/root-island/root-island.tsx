import {hydrate} from 'preact';

declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      'root-island': preact.JSX.HTMLAttributes & {
        component: string;
        props?: string;
      };
    }
  }
}

const islands: Record<string, any> = {};
const islandsModules = import.meta.glob('/islands/**/*.tsx');
Object.entries(islandsModules).forEach(([moduleId, loader]) => {
  const componentName = moduleId.split('/')[2];
  islands[componentName] = loader;
});

class RootIsland extends HTMLElement {
  connectedCallback() {
    const componentName = this.getAttribute('component');
    if (!componentName) {
      return;
    }
    const propsAttr = this.getAttribute('props');
    const props = propsAttr ? JSON.parse(propsAttr) : {};
    this.rehydrate(componentName, props);
  }

  async rehydrate(componentName: string, props: any) {
    const loader = islands[componentName];
    if (loader) {
      const module = await loader();
      const Island = module[componentName];
      if (Island && Island.Component) {
        hydrate(<Island.Component {...props} />, this);
      }
    }
  }
}

if (!window.customElements.get('root-island')) {
  window.customElements.define('root-island', RootIsland);
}
