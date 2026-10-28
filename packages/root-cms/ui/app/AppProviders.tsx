import type {ComponentChildren} from 'preact';
import {LocationProvider} from 'preact-iso';
import {AiEditModal} from '../features/ai/components/AiEditModal/AiEditModal.js';
import {AssetPickerModal} from '../features/assets/components/AssetPickerModal/AssetPickerModal.js';
import {CopyDocModal} from '../features/collections/components/CopyDocModal/CopyDocModal.js';
import {DocPickerModal} from '../features/collections/components/DocPickerModal/DocPickerModal.js';
import {PinnedCommentThreads} from '../features/comments/PinnedCommentThreads/PinnedCommentThreads.js';
import {PinnedCommentThreadsProvider} from '../features/comments/usePinnedCommentThreads.js';
import {DataSourceSelectModal} from '../features/data-sources/components/DataSourceSelectModal/DataSourceSelectModal.js';
import {CompareDraftModal} from '../features/documents/components/CompareDraftModal/CompareDraftModal.js';
import {ComponentPickerModal} from '../features/documents/components/ComponentPickerModal/ComponentPickerModal.js';
import {EditJsonModal} from '../features/documents/components/EditJsonModal/EditJsonModal.js';
import {ReferenceFieldEditorModal} from '../features/documents/components/ReferenceFieldEditorModal/ReferenceFieldEditorModal.js';
import {VersionHistoryModal} from '../features/documents/components/VersionHistoryModal/VersionHistoryModal.js';
import {AddToReleaseModal} from '../features/releases/components/AddToReleaseModal/AddToReleaseModal.js';
import {LockPublishingModal} from '../features/releases/components/LockPublishingModal/LockPublishingModal.js';
import {PublishChecksModal} from '../features/releases/components/PublishChecksModal/PublishChecksModal.js';
import {PublishDocModal} from '../features/releases/components/PublishDocModal/PublishDocModal.js';
import {ScheduleReleaseModal} from '../features/releases/components/ScheduleReleaseModal/ScheduleReleaseModal.js';
import {PendingReleasesProvider} from '../features/releases/usePendingReleases.js';
import {GlobalSearch} from '../features/search/GlobalSearch/GlobalSearch.js';
import {EditTranslationsModal} from '../features/translations/components/EditTranslationsModal/EditTranslationsModal.js';
import {ExportSheetModal} from '../features/translations/components/ExportSheetModal/ExportSheetModal.js';
import {LocalizationModal} from '../features/translations/components/LocalizationModal/LocalizationModal.js';
import {PortTranslationsModal} from '../features/translations/components/PortTranslationsModal/PortTranslationsModal.js';
import {PruneTranslationsModal} from '../features/translations/components/PruneTranslationsModal/PruneTranslationsModal.js';
import {FirebaseContext} from '../hooks/useFirebase.js';
import {SiteSettingsProvider} from '../hooks/useSiteSettings.js';
import {SSEProvider} from '../hooks/useSSE.js';
import {ThemeLoader} from '../hooks/useTheme.js';
import {UserPreferencesProvider} from '../hooks/useUserPreferences.js';
import {ModalsProvider} from '../primitives/modals/ModalsProvider.js';
import {Toaster} from '../primitives/Toast/Toast.js';
import {MantineCompatProvider} from './MantineCompatProvider.js';

/**
 * The app-wide providers (Firebase, data, routing, modals, search, toasts)
 * around the routed page, plus the context modals any page can open.
 */
export function AppProviders(props: {children: ComponentChildren}) {
  return (
    <MantineCompatProvider>
      <FirebaseContext.Provider value={window.firebase}>
        <SSEProvider>
          <SiteSettingsProvider>
            <PendingReleasesProvider>
              <UserPreferencesProvider>
                <ThemeLoader />
                {/*
                    NOTE: <LocationProvider> must wrap <ModalsProvider>. The
                    modals provider renders the currently open modal as a
                    sibling of its children, so any modal that uses the router
                    (e.g. `useLocation().route`) only sees the location context
                    if the location provider is the outer one.
                  */}
                <LocationProvider>
                  <PinnedCommentThreadsProvider>
                    <ModalsProvider
                      modals={{
                        [AddToReleaseModal.id]: AddToReleaseModal,
                        [AiEditModal.id]: AiEditModal,
                        [AssetPickerModal.id]: AssetPickerModal,
                        [CompareDraftModal.id]: CompareDraftModal,
                        [ComponentPickerModal.id]: ComponentPickerModal,
                        [CopyDocModal.id]: CopyDocModal,
                        [DocPickerModal.id]: DocPickerModal,
                        [DataSourceSelectModal.id]: DataSourceSelectModal,
                        [EditJsonModal.id]: EditJsonModal,
                        [EditTranslationsModal.id]: EditTranslationsModal,
                        [ExportSheetModal.id]: ExportSheetModal,
                        [LocalizationModal.id]: LocalizationModal,
                        [LockPublishingModal.id]: LockPublishingModal,
                        [PortTranslationsModal.id]: PortTranslationsModal,
                        [PruneTranslationsModal.id]: PruneTranslationsModal,
                        [PublishChecksModal.id]: PublishChecksModal,
                        [PublishDocModal.id]: PublishDocModal,
                        [ReferenceFieldEditorModal.id]:
                          ReferenceFieldEditorModal,
                        [ScheduleReleaseModal.id]: ScheduleReleaseModal,
                        [VersionHistoryModal.id]: VersionHistoryModal,
                      }}
                    >
                      <GlobalSearch>
                        {props.children}
                        <PinnedCommentThreads />
                      </GlobalSearch>
                    </ModalsProvider>
                  </PinnedCommentThreadsProvider>
                </LocationProvider>
              </UserPreferencesProvider>
            </PendingReleasesProvider>
          </SiteSettingsProvider>
        </SSEProvider>
      </FirebaseContext.Provider>
      <Toaster />
    </MantineCompatProvider>
  );
}
