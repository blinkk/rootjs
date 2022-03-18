/**
 * Validation levels for validation results.
 *
 * Allows the editor to prioritize the display of validation errors.
 */
export enum ValidationLevel {
  Info = 'info',
  Warning = 'warning',
  Error = 'error',
}

/**
 * Validation rule configuration for defining validation rules.
 */
export interface ValidationRuleConfig {
  level?: ValidationLevel;
  message?: string;
  type: string;
}

/**
 * Validation rule for defining allowed/excluded values for a field.
 */
export interface AllowExcludeValuesRuleConfig extends ValidationRuleConfig {
  pattern?: never;
  type: 'allow' | 'exclude';
  values: Array<string | RegExp>;
}

/**
 * Validation rule for defining allowed/excluded patterns for a field.
 */
export interface AllowExcludePatternRuleConfig extends ValidationRuleConfig {
  pattern: string | RegExp;
  type: 'allow' | 'exclude';
  values?: never;
}

/**
 * Validation rule for defining allowed/excluded values for a field.
 */
export type AllowExcludeRuleConfig =
  | AllowExcludeValuesRuleConfig
  | AllowExcludePatternRuleConfig;

/**
 * Validation rule for defining minimum or maximum values for a field.
 */
export interface MinMaxRuleConfig extends ValidationRuleConfig {
  type: 'min' | 'max';
  value: number;
}

/**
 * Composite definition for validation rules.
 */
export type AnyValidationRuleConfig = AllowExcludeRuleConfig | MinMaxRuleConfig;
