import {act, cleanup, fireEvent, render} from '@testing-library/preact';
import {LocationProvider} from 'preact-iso';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ReleaseForm} from './ReleaseForm.js';

let pickerProps: any = null;

vi.mock(
  '../../../collections/components/DocPickerModal/useDocPickerModal.js',
  () => ({
    useDocPickerModal: () => ({
      open: (props: any) => {
        pickerProps = props;
      },
      close: () => {},
    }),
  })
);

vi.mock(
  '../../../data-sources/components/DataSourceSelectModal/useDataSourceSelectModal.js',
  () => ({
    useDataSourceSelectModal: () => ({open: () => {}, close: () => {}}),
  })
);

vi.mock(
  '../../../collections/components/DocPreviewCard/DocPreviewCard.js',
  () => ({
    DocPreviewCard: (props: {docId: string}) => <div>{props.docId}</div>,
  })
);

vi.mock('../../../users/useProjectRoles.js', () => ({
  useProjectRoles: () => ({roles: {'test@example.com': 'ADMIN'}}),
}));

vi.mock('../../../users/permissions.js', () => ({
  testCanPublish: () => true,
}));

vi.mock('../../release.js', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    addRelease: vi.fn(),
    getRelease: vi.fn(),
    updateRelease: vi.fn(),
  };
});

describe('ReleaseForm', () => {
  beforeEach(() => {
    (window as any).firebase = {user: {email: 'test@example.com'}};
    pickerProps = null;
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps the id and description after the docs list changes', async () => {
    const {container, getAllByText} = render(
      <LocationProvider>
        <ReleaseForm buttonLabel="Create release" />
      </LocationProvider>
    );
    const idInput =
      container.querySelector<HTMLInputElement>('input[name="id"]')!;
    const descInput = container.querySelector<HTMLTextAreaElement>(
      'textarea[name="description"]'
    )!;
    const initialId = idInput.value;
    expect(initialId).not.toBe('');

    fireEvent.input(descInput, {target: {value: 'my description'}});

    fireEvent.click(getAllByText('Select')[0]);
    expect(pickerProps).not.toBeNull();
    await act(() => {
      pickerProps.onChangeMulti('Pages/foo', true);
    });

    const idAfter =
      container.querySelector<HTMLInputElement>('input[name="id"]')!;
    const descAfter = container.querySelector<HTMLTextAreaElement>(
      'textarea[name="description"]'
    )!;
    expect(container.textContent).toContain('Pages/foo');
    expect(idAfter.value).toBe(initialId);
    expect(descAfter.value).toBe('my description');
  });
});
