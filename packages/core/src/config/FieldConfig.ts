import {ValidationRuleConfig} from './ValidationConfig';

/**
 * Base interface for all field types.
 */
export interface FieldConfig {
  /**
   * default value to use for the field when no value is provided.
   */
  default?: unknown;
  /**
   * Help string to assist user in understanding the expectations of the field.
   *
   * In complex fields, this can be broken up into zones.
   */
  help?: string | Record<string, string>;
  /**
   * Key to reference the field in the data.
   */
  key: string;
  /**
   * Label for the field in the editor.
   */
  label?: string;
  /**
   * Type of field. Used to create the correct field in the editor UI.
   */
  type: string;
  /**
   * Validation rules that should be applied to the field.
   *
   * In complex fields, this can be broken up into zones.
   */
  validation?:
    | Array<ValidationRuleConfig>
    | Record<string, Array<ValidationRuleConfig>>;
}
