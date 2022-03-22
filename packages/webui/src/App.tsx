import {MantineProvider} from '@mantine/core';
import {ModalsProvider} from '@mantine/modals';
import {BrowserRouter, Routes, Route} from 'react-router-dom';
import {ProjectSelectPage} from './pages/ProjectSelectPage';
import {NotificationsProvider} from '@mantine/notifications';
import {WIP} from './pages/WIP';
import {WorkspaceProvider} from './hooks/useWorkspace';
import {UserProvider} from './hooks/useUser';

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
                  <Route path="/cms/:project" element={<WIP />} />
                  <Route
                    path="/cms/:project/content/:collection"
                    element={<WIP />}
                  />
                  <Route
                    path="/cms/:project/content/:collection/:slug"
                    element={<WIP />}
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
