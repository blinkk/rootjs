import {
  Container,
  Paper,
  Popper,
  Table,
  Text,
  useMantineTheme,
} from '@mantine/core';
import {RefObject, useEffect, useState} from 'react';

interface MediaDetailsLayerProps {
  containerElement: RefObject<HTMLDivElement>;
  visible?: boolean;
}

function buildRow(key: string, children: JSX.Element) {
  return (
    <tr>
      <td>
        <Text size="sm" color="white">
          {key}
        </Text>
      </td>
      <td>
        <Container size={350} px={0}>
          <Text size="sm" color="white">
            {children}
          </Text>
        </Container>
      </td>
    </tr>
  );
}

export function MediaDetailsLayer(props: MediaDetailsLayerProps) {
  const [targets, setTargets] = useState([]);
  const theme = useMantineTheme();

  useEffect(() => {
    const targetElements = Array.from(
      // TODO: Make this configurable.
      props.containerElement.current?.querySelectorAll('img')
    );
    setTargets(targetElements);
  }, []);

  return (
    <>
      {targets.map((target: HTMLImageElement, i: number) => {
        const rect = target.getBoundingClientRect();
        return (
          <Popper
            key={i}
            position="top"
            withArrow
            arrowSize={5}
            mounted={props.visible}
            placement="start"
            referenceElement={target}
            arrowStyle={{
              backgroundColor: theme.colors.dark[5],
              zIndex: 0,
            }}
          >
            <Paper
              shadow="xs"
              style={{
                backgroundColor: theme.colors.dark[5],
                pointerEvents: 'all',
                position: 'relative',
                zIndex: 2,
              }}
            >
              <Table>
                <tbody>
                  {buildRow(
                    'Size (natural)',
                    <>
                      {target.naturalWidth}x{target.naturalHeight}
                    </>
                  )}
                  {buildRow(
                    'Size (visible)',
                    <>
                      {rect.width}x{rect.height}
                    </>
                  )}
                </tbody>
              </Table>
            </Paper>
          </Popper>
        );
      })}
    </>
  );
}
