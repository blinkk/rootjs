/**
 * @fileoverview Types for the generated reference data in `reference/*.json`,
 * written by `scripts/generate_reference.ts`.
 */

export interface CliArgument {
  name: string;
  required: boolean;
  variadic: boolean;
  description: string;
  defaultValue?: string;
  choices?: string[];
}

export interface CliOption {
  flags: string;
  description: string;
  defaultValue?: string;
  choices?: string[];
}

export interface CliCommand {
  /** Full command name, e.g. `secrets init`. */
  name: string;
  aliases: string[];
  usage: string;
  summary: string;
  description: string;
  examples: string[];
  arguments: CliArgument[];
  options: CliOption[];
  subcommands: CliCommand[];
}

export interface CliProgram {
  bin: string;
  packageName: string;
  version: string;
  commands: CliCommand[];
  globalOptions: CliOption[];
}

export interface CliReference {
  programs: CliProgram[];
}

export interface ApiMember {
  name: string;
  signature: string;
  doc: string;
  examples: string[];
  deprecated?: string | boolean;
}

export interface ApiExport extends ApiMember {
  kind:
    | 'function'
    | 'class'
    | 'interface'
    | 'type'
    | 'enum'
    | 'namespace'
    | 'variable';
  /** Class, interface or namespace members. */
  members: ApiMember[];
}

export interface ApiEntryPoint {
  /** e.g. `@blinkk/root-cms/client`. */
  importPath: string;
  doc: string;
  exports: ApiExport[];
}

export interface ApiPackage {
  name: string;
  version: string;
  entryPoints: ApiEntryPoint[];
}

export interface ApiReference {
  packages: ApiPackage[];
}
