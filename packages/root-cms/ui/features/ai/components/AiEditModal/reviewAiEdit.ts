import {Timestamp} from 'firebase/firestore';
import type {FieldRepair} from '../../../../../core/ai-tools.js';
import type {Field, Schema} from '../../../../../core/schema.js';
import type {ValidationError} from '../../../../../core/validation.js';
import {deserializeDocJson} from '../../../documents/doc.js';

export interface AiEditReview {
  /** The value to store, in the same shape as the item being edited. */
  value: any;
  /** Changes made to the proposed value so that it matches the schema. */
  repairs: FieldRepair[];
  /** Problems the proposed value has that the original value doesn't. */
  errors: ValidationError[];
}

function isTimestamp(value: any): boolean {
  return value instanceof Timestamp;
}

/**
 * Checks a value proposed in the AI edit modal against its field. Unlike the
 * chat tools, the modal works on an item in its stored shape. Normalizing
 * converts that to plain JSON (repairing any broken `_array` maps, so this
 * can't unmarshal it first), and it's marshaled back to the stored shape after.
 */
export async function reviewAiEdit(
  proposed: any,
  options: {field: Field; types?: Record<string, Schema>; before?: any}
): Promise<AiEditReview> {
  const {field, types, before} = options;
  const {marshalValueForStorage, prepareValueForWrite} =
    await import('../../../../../core/ai-tools.js');
  const prepared = prepareValueForWrite(deserializeDocJson(proposed), field, {
    types,
    // A copy, since deserializing updates the rich text in place.
    before:
      before === undefined
        ? undefined
        : deserializeDocJson(JSON.parse(JSON.stringify(before))),
    toTimestamp: (millis) => Timestamp.fromMillis(millis),
  });
  return {
    value: marshalValueForStorage(prepared.fields, field, types, {isTimestamp}),
    repairs: prepared.repairs,
    errors: prepared.errors,
  };
}
