/**
 * Base interface for all field configs.
 */
export interface BaseFieldConfig {
  /**
   * Default value to use for the field when no value is provided.
   */
  default?: unknown;
  /**
   * Help string to assist user in understanding the expectations of the field.
   */
  help?: string;
  /**
   * Label for the field in the editor.
   */
  label?: string;
  /**
   * Type of field.
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
