import {MantineProvider} from '@mantine/core';
import {ModalsProvider} from '@mantine/modals';
import {BrowserRouter, Routes, Route} from 'react-router-dom';
import {HomePage} from './pages/HomePage';
import {NotificationsProvider} from '@mantine/notifications';

function App() {
  return (
    <MantineProvider>
      <ModalsProvider labels={{confirm: 'Confirm', cancel: 'Cancel'}}>
        <NotificationsProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/cms/" element={<HomePage />} />
            </Routes>
          </BrowserRouter>
        </NotificationsProvider>
      </ModalsProvider>
    </MantineProvider>
  );
}

export default App;
