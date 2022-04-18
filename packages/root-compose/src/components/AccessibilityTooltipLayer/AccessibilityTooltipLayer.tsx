import {
  Code,
  Container,
  Paper,
  Popper,
  Table,
  Text,
  useMantineTheme,
} from '@mantine/core';
import {RefObject, useEffect, useState} from 'react';

interface AccessibilityTooltipLayerProps {
  containerElement: RefObject<HTMLDivElement>;
  visible?: boolean;
}

interface AttachTarget {
  target: HTMLElement;
}

function buildRow(target: HTMLElement, key: string) {
  return (
    target.getAttribute(key) && (
      <tr>
        <td>
          <Code>{key}</Code>
        </td>
        <td>
          <Container size={350} px={0}>
            <Text color="white" size="xs">
              {target.getAttribute(key)}
            </Text>
          </Container>
        </td>
      </tr>
    )
  );
}

export function AccessibilityTooltipLayer(
  props: AccessibilityTooltipLayerProps
) {
  const [targets, setTargets] = useState([]);
  const theme = useMantineTheme();

  useEffect(() => {
    const targetElements = Array.from(
      // TODO: Make this configurable and/or expand upon this.
      props.containerElement.current?.querySelectorAll(
        '[aria-label], img, [role]'
      )
    );
    setTargets(targetElements);
  }, []);

  return (
    <>
      {targets.map((target: HTMLElement, i: number) => {
        return (
          <Popper
            key={i}
            position="top"
            withArrow
            arrowSize={5}
            mounted={props.visible}
            placement="start"
            referenceElement={target as HTMLDivElement}
            arrowStyle={{
              backgroundColor: theme.colors.dark[5],
              zIndex: 0,
            }}
          >
            <Paper
              shadow="xs"
              style={{
                backgroundColor: theme.colors.dark[5],
                position: 'relative',
                zIndex: 2,
              }}
            >
              <Table>
                <tbody>
                  {buildRow(target, 'alt')}
                  {buildRow(target, 'aria-hidden')}
                  {buildRow(target, 'aria-label')}
                  {buildRow(target, 'aria-level')}
                  {buildRow(target, 'role')}
                </tbody>
              </Table>
            </Paper>
          </Popper>
        );
      })}
    </>
  );
}
