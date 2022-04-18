/**
 * Base interface for all field configs.
 */
export interface FieldConfig {
  /**
   * Id to reference the field in the data.
   */
  id: string;
  /**
   * Type of field.
   */
  type: string;
  /**
   * Label for the field in the editor.
   */
  label?: string;
  /**
   * Help string to assist user in understanding the expectations of the field.
   */
  help?: string;
  /**
   * Default value to use for the field when no value is provided.
   */
  default?: unknown;
}
