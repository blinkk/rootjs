import readline from 'node:readline/promises';

export interface TextPromptOptions {
  default?: string;
  /** Returns an error message for invalid input, or undefined if valid. */
  validate?: (value: string) => string | undefined;
}

export interface SelectChoice<T extends string> {
  value: T;
  label: string;
}

/** Asks the user questions. Swapped for a scripted fake in tests. */
export interface Prompter {
  text(message: string, options?: TextPromptOptions): Promise<string>;
  confirm(message: string, defaultValue: boolean): Promise<boolean>;
  select<T extends string>(
    message: string,
    choices: SelectChoice<T>[],
    defaultValue?: T
  ): Promise<T>;
  /** Waits for the user to press enter. */
  pause(message: string): Promise<void>;
}

/**
 * Prompter backed by `node:readline`. With `yes`, every question takes its
 * default answer and a question without a default is an error.
 */
export class ReadlinePrompter implements Prompter {
  private yes: boolean;

  constructor(options: {yes?: boolean} = {}) {
    this.yes = Boolean(options.yes);
  }

  async text(message: string, options: TextPromptOptions = {}) {
    if (this.yes) {
      if (options.default === undefined) {
        throw new Error(`--yes was passed but "${message}" has no default`);
      }
      const error = options.validate?.(options.default);
      if (error) {
        throw new Error(`${message}: ${error}`);
      }
      return options.default;
    }
    const suffix = options.default ? ` (${options.default})` : '';
    for (;;) {
      const answer = (await this.ask(`${message}${suffix}: `)).trim();
      const value = answer || options.default || '';
      const error = value ? options.validate?.(value) : 'a value is required';
      if (!error) {
        return value;
      }
      console.log(`  ${error}`);
    }
  }

  async confirm(message: string, defaultValue: boolean) {
    if (this.yes) {
      return defaultValue;
    }
    const hint = defaultValue ? 'Y/n' : 'y/N';
    for (;;) {
      const answer = (await this.ask(`${message} (${hint}) `))
        .trim()
        .toLowerCase();
      if (!answer) {
        return defaultValue;
      }
      if (answer === 'y' || answer === 'yes') {
        return true;
      }
      if (answer === 'n' || answer === 'no') {
        return false;
      }
    }
  }

  async select<T extends string>(
    message: string,
    choices: SelectChoice<T>[],
    defaultValue?: T
  ): Promise<T> {
    const defaultIndex = Math.max(
      0,
      choices.findIndex((c) => c.value === defaultValue)
    );
    if (this.yes) {
      return choices[defaultIndex].value;
    }
    console.log(message);
    choices.forEach((choice, i) => {
      console.log(`  ${i + 1}) ${choice.label}`);
    });
    for (;;) {
      const answer = (
        await this.ask(`Choose 1-${choices.length} (${defaultIndex + 1}): `)
      ).trim();
      if (!answer) {
        return choices[defaultIndex].value;
      }
      const index = Number(answer) - 1;
      if (Number.isInteger(index) && choices[index]) {
        return choices[index].value;
      }
    }
  }

  async pause(message: string) {
    if (this.yes) {
      return;
    }
    await this.ask(`${message} `);
  }

  private async ask(question: string): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      return await rl.question(question);
    } finally {
      rl.close();
    }
  }
}
