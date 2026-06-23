import {cleanup, render, screen} from '@testing-library/preact';
import {afterEach, describe, expect, test, vi} from 'vitest';
import * as schema from '../../../../core/schema.js';
import {FieldErrorBoundary} from '../../FieldErrorBoundary/FieldErrorBoundary.js';
import {FieldProps} from './FieldProps.js';

// Mock Mantine inputs. The real components require a MantineProvider context
// that isn't available under @preact/compat in jsdom; these stubs keep the
// test focused on StringField's own value-handling logic.
vi.mock('@mantine/core', () => ({
  TextInput: ({value}: any) => <input value={value} readOnly />,
  Textarea: ({value}: any) => <textarea value={value} readOnly />,
}));

// Mock useDraftDocValue so the field can be rendered without the full draft
// doc controller/context. The mocked value is controlled per-test.
let mockValue: any = '';
vi.mock('../../../hooks/useDraftDoc.js', () => ({
  useDraftDocValue: () => [mockValue, vi.fn()] as const,
}));

// Mock iframe-preview to avoid touching window messaging.
vi.mock('../../../utils/iframe-preview.js', () => ({
  requestHighlightNode: vi.fn(),
}));

// Import after mocks are registered.
const {StringField} = await import('./StringField.js');

function renderField(value: any) {
  mockValue = value;
  const field: schema.StringField = {
    type: 'string',
    id: 'title',
  };
  const props: FieldProps = {
    field,
    deepKey: 'meta.title',
  };
  return render(
    <FieldErrorBoundary deepKey={props.deepKey}>
      <StringField {...props} />
    </FieldErrorBoundary>
  );
}

describe('StringField', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test('renders a string value without error', () => {
    renderField('Hello world');
    expect(screen.queryByText('This field failed to render.')).toBeNull();
  });

  test('renders an empty string value without error', () => {
    renderField('');
    expect(screen.queryByText('This field failed to render.')).toBeNull();
  });

  test('shows the field error boundary for a non-string value', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    renderField({foo: 'bar'});

    expect(screen.getByText('This field failed to render.')).toBeTruthy();
    expect(consoleError).toHaveBeenCalled();
    // The garbled "[object Object]" string should NOT be rendered.
    expect(screen.queryByDisplayValue('[object Object]')).toBeNull();
  });
});
