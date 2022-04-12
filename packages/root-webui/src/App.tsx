import {MantineProvider} from '@mantine/core';
import {ModalsProvider} from '@mantine/modals';
import {BrowserRouter, Routes, Route} from 'react-router-dom';
import {ProjectSelectPage} from './pages/ProjectSelectPage/ProjectSelectPage';
import {NotificationsProvider} from '@mantine/notifications';
import {WorkspaceProvider} from './hooks/useWorkspace';
import {UserProvider} from './hooks/useUser';
import {ProjectPage} from './pages/ProjectPage/ProjectPage';
import {CollectionPage} from './pages/CollectionPage/CollectionPage';
import {DocumentPage} from './pages/DocumentPage/DocumentPage';

function App() {
  return (
    <MantineProvider>
      <ModalsProvider labels={{confirm: 'Confirm', cancel: 'Cancel'}}>
        <NotificationsProvider>
          <WorkspaceProvider>
            <UserProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/cms/" element={<ProjectSelectPage />} />
                  <Route path="/cms/:projectId" element={<ProjectPage />} />
                  <Route
                    path="/cms/:projectId/content/:collectionId"
                    element={<CollectionPage />}
                  />
                  <Route
                    path="/cms/:projectId/content/:collectionId/:slug"
                    element={<DocumentPage />}
                  />
                </Routes>
              </BrowserRouter>
            </UserProvider>
          </WorkspaceProvider>
        </NotificationsProvider>
      </ModalsProvider>
    </MantineProvider>
  );
}

export default App;
