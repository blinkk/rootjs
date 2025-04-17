export interface ArbSourceMeta {
  type?: 'text';
  context?: string;
  description?: string;
}

export class Arb {
  private data: any = {};

  setMeta(meta: {
    locale?: string;
    context?: string;
    description?: string;
    last_modified?: string;
  }) {
    Object.entries(meta).forEach(([key, value]) => {
      if (!key.startsWith('@@')) {
        key = `@@${key}`;
      }
      this.data[key] = value;
    });
  }

  add(key: string, source: string, meta?: ArbSourceMeta) {
    this.data[key] = source;
    if (meta) {
      this.data[`@${key}`] = meta;
    }
  }

  get(key: string): {source: string; meta?: ArbSourceMeta} | null {
    const source = this.data[key];
    if (!source) {
      return null;
    }
    return {source, meta: this.data[`@${key}`]};
  }

  list(): {key: string; source: string; meta?: ArbSourceMeta}[] {
    const result: {key: string; source: string; meta?: ArbSourceMeta}[] = [];
    Object.entries(this.data).forEach(([key]) => {
      if (key.startsWith('@@')) {
        return;
      }
      const source = this.data[key];
      const meta = this.data[`@${key}`];
      result.push({key, source, meta});
    });
    return result;
  }

  toJson() {
    return {...this.data};
  }

  toString() {
    return JSON.stringify(this.toJson(), null, 2);
  }
}
