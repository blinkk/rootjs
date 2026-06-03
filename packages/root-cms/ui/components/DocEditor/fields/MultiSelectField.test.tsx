import {render} from '@testing-library/preact';
import {describe, it, vi, expect} from 'vitest';
import {MultiSelectField} from './MultiSelectField.js';

const setValueMock = vi.fn();
const useDraftDocValueMock = vi.fn();

vi.mock('../../../hooks/useDraftDoc.js', () => ({
  useDraftDocValue: (key: string, defaultValue: unknown) =>
    useDraftDocValueMock(key, defaultValue),
}));

// Stub drag-and-drop so StringListField renders without errors.
vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({children}: any) => children,
  Droppable: ({children}: any) =>
    children({innerRef: () => {}, droppableProps: {}}, {}),
  Draggable: ({children}: any) =>
    children(
      {innerRef: () => {}, draggableProps: {}, dragHandleProps: {}},
      {isDragging: false}
    ),
}));

// Stub Mantine components that require MantineProvider context.
vi.mock('@mantine/core', () => ({
  MultiSelect: (props: any) => (
    <select data-testid="mantine-multiselect" multiple>
      {(props.value || []).map((v: string) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  ),
  ActionIcon: ({children, ...props}: any) => (
    <button {...props}>{children}</button>
  ),
  Button: ({children, ...props}: any) => <button {...props}>{children}</button>,
  Tooltip: ({children}: any) => children,
}));

describe('MultiSelectField serialization', () => {
  const sampleData: string[] = ['alpha', 'beta', 'gamma'];

  it('multiselect variant reads string[] from draft doc', () => {
    useDraftDocValueMock.mockReturnValue([sampleData, setValueMock]);

    render(
      <MultiSelectField
        field={{type: 'multiselect', label: 'Tags'}}
        deepKey="fields.tags"
      />
    );

    expect(useDraftDocValueMock).toHaveBeenCalledWith('fields.tags', []);
  });

  it('list variant reads string[] from draft doc', () => {
    useDraftDocValueMock.mockReturnValue([sampleData, setValueMock]);

    render(
      <MultiSelectField
        field={{type: 'multiselect', label: 'Tags', variant: 'list'}}
        deepKey="fields.tags"
      />
    );

    expect(useDraftDocValueMock).toHaveBeenCalledWith('fields.tags', []);
  });

  it('both variants use the same default value', () => {
    useDraftDocValueMock.mockReturnValue([[], setValueMock]);

    const calls: unknown[][] = [];

    // Render multiselect variant.
    render(
      <MultiSelectField
        field={{type: 'multiselect', label: 'Tags'}}
        deepKey="fields.tags"
      />
    );
    calls.push(useDraftDocValueMock.mock.calls.at(-1)!);

    // Render list variant.
    render(
      <MultiSelectField
        field={{type: 'multiselect', label: 'Tags', variant: 'list'}}
        deepKey="fields.tags"
      />
    );
    calls.push(useDraftDocValueMock.mock.calls.at(-1)!);

    // Both should pass the same (key, default) to useDraftDocValue.
    expect(calls[0]).toEqual(calls[1]);
  });

  it('list variant writes string[] via setValue', () => {
    useDraftDocValueMock.mockReturnValue([sampleData, setValueMock]);
    setValueMock.mockClear();

    const {container} = render(
      <MultiSelectField
        field={{type: 'multiselect', label: 'Tags', variant: 'list'}}
        deepKey="fields.tags"
      />
    );

    // Simulate typing in the first input.
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).not.toBeNull();
    input.value = 'alpha-edited';
    input.dispatchEvent(new Event('input', {bubbles: true}));

    // setValue should have been called with a string[].
    expect(setValueMock).toHaveBeenCalled();
    const written = setValueMock.mock.calls[0][0];
    expect(Array.isArray(written)).toBe(true);
    written.forEach((v: unknown) => expect(typeof v).toBe('string'));
  });
});
