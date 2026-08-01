import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/preact';
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';

// Mock Mantine. The real components need a MantineProvider context that isn't
// available under @preact/compat in jsdom; these stubs keep the test focused
// on the dialog's own iteration logic.
vi.mock('@mantine/core', () => ({
  Button: ({children, onClick, disabled, loading}: any) => (
    <button onClick={onClick} disabled={disabled || loading}>
      {children}
    </button>
  ),
  Group: ({children}: any) => <div>{children}</div>,
  LoadingOverlay: ({visible}: any) => (visible ? <div>Loading</div> : null),
  Modal: ({children, opened}: any) => (opened ? <div>{children}</div> : null),
  Select: ({value, onChange, data}: any) => (
    <select
      aria-label="Model"
      value={value}
      onChange={(e: any) => onChange(e.currentTarget.value)}
    >
      {data.map((item: any) => (
        <option value={item.value}>{item.label}</option>
      ))}
    </select>
  ),
  Stack: ({children}: any) => <div>{children}</div>,
  Text: ({children}: any) => <div>{children}</div>,
  // Mantine's Textarea fires `onChange` on every keystroke (React semantics,
  // via the @preact/compat alias), so bind it to `onInput` here.
  Textarea: ({label, value, onChange, onKeyDown}: any) => (
    <textarea
      aria-label={label}
      value={value}
      onInput={onChange}
      onKeyDown={onKeyDown}
    />
  ),
  Tooltip: ({children}: any) => <div>{children}</div>,
  useMantineTheme: () => ({colorScheme: 'light', colors: {dark: [], gray: []}}),
}));

vi.mock('@mantine/notifications', () => ({showNotification: vi.fn()}));

vi.mock('../../../utils/ai.js', () => ({
  getAiImageEditingModels: () => [{id: 'nano-banana', label: 'Nano Banana'}],
}));

// Import after mocks are registered.
const {AiImageEditorDialog} = await import('./AiImageEditorDialog.js');

const ORIGINAL_SRC = 'https://lh3.googleusercontent.com/original';

/** Returns the request bodies sent to `/cms/api/ai.edit_image`, in order. */
function editRequests(fetchMock: any): any[] {
  return fetchMock.mock.calls
    .filter((call: any[]) => call[0] === '/cms/api/ai.edit_image')
    .map((call: any[]) => JSON.parse(call[1].body));
}

/** Types `text` into the prompt input and clicks Generate. */
async function generate(text: string) {
  fireEvent.input(screen.getByLabelText('Describe the change'), {
    target: {value: text},
  });
  await waitFor(() => {
    expect((screen.getByText('Generate') as HTMLButtonElement).disabled).toBe(
      false
    );
  });
  fireEvent.click(screen.getByText('Generate'));
}

describe('AiImageEditorDialog', () => {
  let fetchMock: any;
  let generation = 0;

  beforeEach(() => {
    generation = 0;
    fetchMock = vi.fn(async (url: string) => {
      if (url === '/cms/api/ai.edit_image') {
        generation += 1;
        return {
          ok: true,
          json: async () => ({
            success: true,
            image: `data:image/png;base64,generated${generation}`,
          }),
        };
      }
      return {ok: true, blob: async () => new Blob([''], {type: 'image/png'})};
    });
    vi.stubGlobal('fetch', fetchMock);
    window.fetch = fetchMock;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function renderDialog(onSave = vi.fn()) {
    render(
      <AiImageEditorDialog
        opened
        onClose={vi.fn()}
        src={ORIGINAL_SRC}
        filename="photo.jpg"
        onSave={onSave}
      />
    );
    return onSave;
  }

  test('sends the original image on the first generation', async () => {
    renderDialog();
    await generate('make the sky purple');

    await waitFor(() => expect(editRequests(fetchMock)).toHaveLength(1));
    expect(editRequests(fetchMock)[0]).toMatchObject({
      imageUrl: ORIGINAL_SRC,
      prompt: 'make the sky purple',
      modelId: 'nano-banana',
    });
  });

  test('iterates on the previous result', async () => {
    renderDialog();
    await generate('make the sky purple');
    await waitFor(() => expect(editRequests(fetchMock)).toHaveLength(1));

    await generate('now add a rainbow');
    await waitFor(() => expect(editRequests(fetchMock)).toHaveLength(2));

    // The second edit builds on the first result, not the original.
    expect(editRequests(fetchMock)[1]).toMatchObject({
      imageUrl: 'data:image/png;base64,generated1',
      prompt: 'now add a rainbow',
    });
  });

  test('branches from an earlier version when one is reselected', async () => {
    renderDialog();
    await generate('make the sky purple');
    await waitFor(() => expect(editRequests(fetchMock)).toHaveLength(1));

    // Step back to the original and edit from there instead.
    fireEvent.click(screen.getByLabelText('Original'));
    await generate('make the sky green');

    await waitFor(() => expect(editRequests(fetchMock)).toHaveLength(2));
    expect(editRequests(fetchMock)[1]).toMatchObject({
      imageUrl: ORIGINAL_SRC,
      prompt: 'make the sky green',
    });
  });

  test('cannot save until an edit has been generated', async () => {
    const onSave = renderDialog();
    expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(true);

    await generate('make the sky purple');
    await waitFor(() =>
      expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(
        false
      )
    );

    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    // The saved file is named after the original, with the generated ext.
    expect(onSave.mock.calls[0][0].name).toBe('photo-edited.png');
  });

  test('keeps the original selectable and does not save it', async () => {
    renderDialog();
    await generate('make the sky purple');
    await waitFor(() =>
      expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(
        false
      )
    );

    fireEvent.click(screen.getByLabelText('Original'));
    await waitFor(() =>
      expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(
        true
      )
    );
  });
});
