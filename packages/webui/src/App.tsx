import {MantineProvider} from '@mantine/core';
import {ModalsProvider} from '@mantine/modals';
import {BrowserRouter, Routes, Route} from 'react-router-dom';
import {HomePage} from './pages/HomePage';
import {NotificationsProvider} from '@mantine/notifications';
import {WIP} from './pages/WIP';
import {WorkspaceProvider} from './hooks/useWorkspace';

function App() {
  return (
    <WorkspaceProvider>
      <MantineProvider>
        <ModalsProvider labels={{confirm: 'Confirm', cancel: 'Cancel'}}>
          <NotificationsProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/cms/" element={<HomePage />} />
                <Route path="/cms/:project" element={<WIP />} />
                <Route
                  path="/cms/:project/docs/:collection"
                  element={<WIP />}
                />
                <Route
                  path="/cms/:project/docs/:collection/:slug"
                  element={<WIP />}
                />
              </Routes>
            </BrowserRouter>
          </NotificationsProvider>
        </ModalsProvider>
      </MantineProvider>
    </WorkspaceProvider>
  );
}

export default App;
