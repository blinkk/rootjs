import {Paper, Popper, Text, useMantineTheme} from '@mantine/core';
import {RefObject, useEffect, useState} from 'react';

export interface ModuleLabelLayerProps {
  containerElement: RefObject<HTMLDivElement>;
  visible?: boolean;
}

export function ModuleLabelLayer(props: ModuleLabelLayerProps) {
  const [targets, setTargets] = useState([]);
  const theme = useMantineTheme();

  useEffect(() => {
    const targetElements = Array.from(
      props.containerElement.current?.querySelectorAll('page-module')
    );
    setTargets(targetElements);
  }, []);

  return (
    <>
      {targets.map((target: HTMLDivElement, i: number) => {
        const index = i + 1;
        const id = target.id || 'm' + index;
        return (
          <Popper
            key={i}
            position="top"
            mounted={props.visible}
            placement="start"
            withArrow={true}
            arrowSize={2}
            arrowStyle={{
              backgroundColor: theme.colors.dark[5],
              bottom: 'auto',
              top: '-3px',
            }}
            referenceElement={target}
            gutter={0}
            modifiers={[
              {
                name: 'flip',
                options: {
                  fallbackPlacements: [],
                },
              },
              {
                name: 'offset',
                options: {
                  offset: [0, -33],
                },
              },
            ]}
          >
            <Paper
              shadow="xs"
              style={{
                pointerEvents: 'all',
                padding: '5px 10px',
                fontWeight: '600',
                backgroundColor: theme.colors.dark[5],
              }}
            >
              <Text component="a" href={'#' + id} color="white" size="xs">
                {index}. {target.getAttribute('template')}
              </Text>
            </Paper>
          </Popper>
        );
      })}
    </>
  );
}
