import {Alert, Button, Group, TextInput} from '@mantine/core';
import {IconAlertTriangle, IconRefresh} from '@tabler/icons-preact';
import {ChangeEvent} from 'preact/compat';
import {useEffect, useMemo, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {FieldProps} from './FieldProps.js';

export function UidField(props: FieldProps) {
  const field = props.field as schema.UidField;
  const [value, setValue] = useState('');

  function onChange(newValue: string) {
    setValue(newValue);
    props.draft.updateKey(props.deepKey, newValue);
  }

  function generateUid() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const tag = field.tag ? `${field.tag}-` : '';
    const newUid = `${tag}${timestamp}-${random}`;
    onChange(newUid);
  }

  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
      props.deepKey,
      (newValue: string) => {
        setValue(newValue || '');
      }
    );
    return unsubscribe;
  }, []);

  // Check for duplicate UIDs in the document
  const duplicateWarning = useMemo(() => {
    if (!value) return null;
    
    const docData = props.draft.getData();
    const duplicates = findDuplicateUids(docData, value, props.deepKey);
    
    if (duplicates.length > 0) {
      return `Duplicate UID found in field(s): ${duplicates.join(', ')}`;
    }
    return null;
  }, [value, props.draft.getData(), props.deepKey]);

  return (
    <div>
      <Group spacing="xs">
        <TextInput
          size="xs"
          radius={0}
          value={value}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            onChange(e.currentTarget.value);
          }}
          style={{flex: 1}}
          placeholder={field.placeholder || 'Enter UID or generate one'}
        />
        <Button
          size="xs"
          variant="light"
          leftIcon={<IconRefresh size={14} />}
          onClick={generateUid}
        >
          {field.buttonLabel || 'Generate UID'}
        </Button>
      </Group>
      {duplicateWarning && (
        <Alert
          icon={<IconAlertTriangle size={16} />}
          title="Duplicate UID Warning"
          color="orange"
          variant="light"
          mt="xs"
        >
          {duplicateWarning}
        </Alert>
      )}
    </div>
  );
}

/**
 * Recursively searches for duplicate UIDs in the document data.
 */
function findDuplicateUids(
  data: any,
  targetUid: string,
  excludeKey: string,
  path = ''
): string[] {
  const duplicates: string[] = [];

  if (!data || typeof data !== 'object') {
    return duplicates;
  }

  for (const [key, value] of Object.entries(data)) {
    const currentPath = path ? `${path}.${key}` : key;
    
    if (currentPath === excludeKey) {
      continue; // Skip the current field
    }

    if (typeof value === 'string' && value === targetUid) {
      duplicates.push(currentPath);
    } else if (Array.isArray(value)) {
      // Check array items
      value.forEach((item, index) => {
        const arrayPath = `${currentPath}[${index}]`;
        duplicates.push(...findDuplicateUids(item, targetUid, excludeKey, arrayPath));
      });
    } else if (typeof value === 'object' && value !== null) {
      // Recursively check nested objects
      duplicates.push(...findDuplicateUids(value, targetUid, excludeKey, currentPath));
    }
  }

  return duplicates;
}