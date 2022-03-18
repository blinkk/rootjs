/**
 * Base interface for all field configs.
 */
export interface BaseFieldConfig {
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
   * Label for the field in the editor.
   */
  label?: string;
  /**
   * Type of field. Used to create the correct field in the editor UI.
   */
  type: string;
}

/**
 * Field config with the required id for standard field configs.
 */
export interface FieldConfig extends BaseFieldConfig {
  /**
   * Id to reference the field in the data.
   */
  id: string;
}
