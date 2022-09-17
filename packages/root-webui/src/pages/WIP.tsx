import {Box, Center, Stack, Title} from '@mantine/core';
import {WebUIShell} from '../components/WebUIShell/WebUIShell';
import {MaterialIcon} from '../icons/MaterialIcon';

export function WIP() {
  return (
    <WebUIShell>
      <Center sx={{width: '100%', height: 'calc(100vh - 48px)'}}>
        <Stack align="center">
          <Center
            sx={(theme) => ({
              borderRadius: '50%',
              width: 64,
              height: 64,
              background: 'linear-gradient(145deg, #72BFEB 0%, #458BC7 100%)',
            })}
          >
            <MaterialIcon icon="handyman" size={40} color="white" />
          </Center>
          <Title>Under Construction</Title>
        </Stack>
      </Center>
    </WebUIShell>
  );
}
