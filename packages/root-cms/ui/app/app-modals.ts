import {AI_EDIT_MODAL_ID} from '../features/ai/components/AiEditModal/useAiEditModal.js';
import {ASSET_PICKER_MODAL_ID} from '../features/assets/components/AssetPickerModal/useAssetPickerModal.js';
import {COPY_DOC_MODAL_ID} from '../features/collections/components/CopyDocModal/useCopyDocModal.js';
import {DOC_PICKER_MODAL_ID} from '../features/collections/components/DocPickerModal/useDocPickerModal.js';
import {DATA_SOURCE_SELECT_MODAL_ID} from '../features/data-sources/components/DataSourceSelectModal/useDataSourceSelectModal.js';
import {COMPARE_DRAFT_MODAL_ID} from '../features/documents/components/CompareDraftModal/useCompareDraftModal.js';
import {COMPONENT_PICKER_MODAL_ID} from '../features/documents/components/ComponentPickerModal/useComponentPickerModal.js';
import {EDIT_JSON_MODAL_ID} from '../features/documents/components/EditJsonModal/useEditJsonModal.js';
import {REFERENCE_FIELD_EDITOR_MODAL_ID} from '../features/documents/components/ReferenceFieldEditorModal/useReferenceFieldEditorModal.js';
import {VERSION_HISTORY_MODAL_ID} from '../features/documents/components/VersionHistoryModal/useVersionHistoryModal.js';
import {ADD_TO_RELEASE_MODAL_ID} from '../features/releases/components/AddToReleaseModal/useAddToReleaseModal.js';
import {LOCK_PUBLISHING_MODAL_ID} from '../features/releases/components/LockPublishingModal/useLockPublishingModal.js';
import {PUBLISH_DOC_MODAL_ID} from '../features/releases/components/PublishDocModal/usePublishDocModal.js';
import {SCHEDULE_RELEASE_MODAL_ID} from '../features/releases/components/ScheduleReleaseModal/useScheduleReleaseModal.js';
import {PUBLISH_CHECKS_MODAL_ID} from '../features/releases/usePublishChecks.js';
import {EDIT_TRANSLATIONS_MODAL_ID} from '../features/translations/components/EditTranslationsModal/useEditTranslationsModal.js';
import {EXPORT_SHEET_MODAL_ID} from '../features/translations/components/ExportSheetModal/useExportSheetModal.js';
import {LOCALIZATION_MODAL_ID} from '../features/translations/components/LocalizationModal/useLocalizationModal.js';
import {PORT_TRANSLATIONS_MODAL_ID} from '../features/translations/components/PortTranslationsModal/usePortTranslationsModal.js';
import {PRUNE_TRANSLATIONS_MODAL_ID} from '../features/translations/components/PruneTranslationsModal/usePruneTranslationsModal.js';
import {lazyComponent} from './lazy-component.js';

/**
 * The context modals any page can open. Each one is lazy-loaded so that its
 * dependencies (the AI SDKs, Lexical, the doc editor) stay out of the startup
 * bundle, so import a modal's `useXModal` hook rather than its component.
 */
export const APP_MODALS = {
  [ADD_TO_RELEASE_MODAL_ID]: lazyComponent(() =>
    import('../features/releases/components/AddToReleaseModal/AddToReleaseModal.js').then(
      (m) => m.AddToReleaseModal
    )
  ),
  [AI_EDIT_MODAL_ID]: lazyComponent(() =>
    import('../features/ai/components/AiEditModal/AiEditModal.js').then(
      (m) => m.AiEditModal
    )
  ),
  [ASSET_PICKER_MODAL_ID]: lazyComponent(() =>
    import('../features/assets/components/AssetPickerModal/AssetPickerModal.js').then(
      (m) => m.AssetPickerModal
    )
  ),
  [COMPARE_DRAFT_MODAL_ID]: lazyComponent(() =>
    import('../features/documents/components/CompareDraftModal/CompareDraftModal.js').then(
      (m) => m.CompareDraftModal
    )
  ),
  [COMPONENT_PICKER_MODAL_ID]: lazyComponent(() =>
    import('../features/documents/components/ComponentPickerModal/ComponentPickerModal.js').then(
      (m) => m.ComponentPickerModal
    )
  ),
  [COPY_DOC_MODAL_ID]: lazyComponent(() =>
    import('../features/collections/components/CopyDocModal/CopyDocModal.js').then(
      (m) => m.CopyDocModal
    )
  ),
  [DATA_SOURCE_SELECT_MODAL_ID]: lazyComponent(() =>
    import('../features/data-sources/components/DataSourceSelectModal/DataSourceSelectModal.js').then(
      (m) => m.DataSourceSelectModal
    )
  ),
  [DOC_PICKER_MODAL_ID]: lazyComponent(() =>
    import('../features/collections/components/DocPickerModal/DocPickerModal.js').then(
      (m) => m.DocPickerModal
    )
  ),
  [EDIT_JSON_MODAL_ID]: lazyComponent(() =>
    import('../features/documents/components/EditJsonModal/EditJsonModal.js').then(
      (m) => m.EditJsonModal
    )
  ),
  [EDIT_TRANSLATIONS_MODAL_ID]: lazyComponent(() =>
    import('../features/translations/components/EditTranslationsModal/EditTranslationsModal.js').then(
      (m) => m.EditTranslationsModal
    )
  ),
  [EXPORT_SHEET_MODAL_ID]: lazyComponent(() =>
    import('../features/translations/components/ExportSheetModal/ExportSheetModal.js').then(
      (m) => m.ExportSheetModal
    )
  ),
  [LOCALIZATION_MODAL_ID]: lazyComponent(() =>
    import('../features/translations/components/LocalizationModal/LocalizationModal.js').then(
      (m) => m.LocalizationModal
    )
  ),
  [LOCK_PUBLISHING_MODAL_ID]: lazyComponent(() =>
    import('../features/releases/components/LockPublishingModal/LockPublishingModal.js').then(
      (m) => m.LockPublishingModal
    )
  ),
  [PORT_TRANSLATIONS_MODAL_ID]: lazyComponent(() =>
    import('../features/translations/components/PortTranslationsModal/PortTranslationsModal.js').then(
      (m) => m.PortTranslationsModal
    )
  ),
  [PRUNE_TRANSLATIONS_MODAL_ID]: lazyComponent(() =>
    import('../features/translations/components/PruneTranslationsModal/PruneTranslationsModal.js').then(
      (m) => m.PruneTranslationsModal
    )
  ),
  [PUBLISH_CHECKS_MODAL_ID]: lazyComponent(() =>
    import('../features/releases/components/PublishChecksModal/PublishChecksModal.js').then(
      (m) => m.PublishChecksModal
    )
  ),
  [PUBLISH_DOC_MODAL_ID]: lazyComponent(() =>
    import('../features/releases/components/PublishDocModal/PublishDocModal.js').then(
      (m) => m.PublishDocModal
    )
  ),
  [REFERENCE_FIELD_EDITOR_MODAL_ID]: lazyComponent(() =>
    import('../features/documents/components/ReferenceFieldEditorModal/ReferenceFieldEditorModal.js').then(
      (m) => m.ReferenceFieldEditorModal
    )
  ),
  [SCHEDULE_RELEASE_MODAL_ID]: lazyComponent(() =>
    import('../features/releases/components/ScheduleReleaseModal/ScheduleReleaseModal.js').then(
      (m) => m.ScheduleReleaseModal
    )
  ),
  [VERSION_HISTORY_MODAL_ID]: lazyComponent(() =>
    import('../features/documents/components/VersionHistoryModal/VersionHistoryModal.js').then(
      (m) => m.VersionHistoryModal
    )
  ),
};

/** Modals opened often enough that the first open shouldn't wait on a chunk. */
const COMMON_MODALS = [
  ASSET_PICKER_MODAL_ID,
  COMPONENT_PICKER_MODAL_ID,
  DOC_PICKER_MODAL_ID,
  PUBLISH_DOC_MODAL_ID,
] as const;

/** Time to wait for the browser to go idle before preloading anyway. */
const PRELOAD_IDLE_TIMEOUT_MS = 5 * 1000;

/**
 * Preloads the common modals once the browser is idle. Failures are ignored,
 * since opening a modal retries its import.
 */
export function preloadCommonModals() {
  function preload() {
    COMMON_MODALS.forEach((id) => {
      APP_MODALS[id].preload().catch(() => {});
    });
  }
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(preload, {timeout: PRELOAD_IDLE_TIMEOUT_MS});
  } else {
    setTimeout(preload, PRELOAD_IDLE_TIMEOUT_MS);
  }
}
