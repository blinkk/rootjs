import {
  Affix,
  Button,
  Checkbox,
  Dialog,
  Group,
  Kbd,
  Popover,
  Select,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {LayersIcon, QuestionMarkCircledIcon} from '@radix-ui/react-icons';
import {NotificationsProvider, showNotification} from '@mantine/notifications';
import {RefObject, useState} from 'react';
import {
  ScreenSizeSimulatorBreakpoints,
  ScreenSizeSimulatorSelectItem,
  useScreenSizeSimulator,
} from '../ScreenSizeSimulator/ScreenSizeSimulator';
import {useHotkeys, useLocalStorage} from '@mantine/hooks';

import {AccessibilityTooltipLayer} from '../AccessibilityTooltipLayer/AccessibilityTooltipLayer';
import {MeasurementUtilityLayer} from '../MeasurementUtilityLayer/MeasurementUtilityLayer';
import {MediaDetailsLayer} from '../MediaDetailsLayer/MediaDetailsLayer';
import {ModuleLabelLayer} from '../ModuleLabelLayer/ModuleLabelLayer';

export interface InspectButtonProps {
  /** The container holding all page modules. */
  containerElement: RefObject<HTMLDivElement>;
}

export function InspectButton(props: InspectButtonProps) {
  const [opened, setOpened] = useState(false);
  const [screenSizeValue, setScreenSizeValue] = useScreenSizeSimulator(
    props.containerElement
  ) as [string, (value: string) => void];

  useHotkeys([
    ['shift+?', () => setOpened(o => !o)],
    ['ctrl+A', () => toggleAccessibilityLayer()],
    ['ctrl+M', () => toggleModuleLabelLayer()],
    ['ctrl+D', () => toggleMediaDetailsLayer()],
    ['ctrl+alt+0', () => setScreenSizeValue('')],
    ['ctrl+alt+1', () => setScreenSizeValue('320px')],
    ['ctrl+alt+2', () => setScreenSizeValue('675px')],
    ['ctrl+alt+3', () => setScreenSizeValue('1440px')],
    ['ctrl+alt+4', () => setScreenSizeValue('1920px')],
  ]);

  // Accessibility layer.

  const [isAccessibilityLayerEnabled, setAccessibilityLayerEnabled] =
    useLocalStorage<boolean>({
      key: 'accessibilityLayerEnabled',
      defaultValue: false,
    });

  const toggleAccessibilityLayer = () => {
    const enable = !isAccessibilityLayerEnabled;
    setAccessibilityLayerEnabled(enable);
    showNotification({
      message: enable
        ? 'Accessibility labels visible'
        : 'Accessibility labels hidden',
      disallowClose: true,
    });
  };

  // Measurement layer.

  const [isMeasurementLayerEnabled, setMeasurementLayerEnabled] =
    useLocalStorage<boolean>({
      key: 'measurementLayerEnabled',
      defaultValue: true,
    });

  const toggleMeasurementLayer = () => {
    const enable = !isMeasurementLayerEnabled;
    setMeasurementLayerEnabled(enable);
    showNotification({
      message: enable
        ? 'Measurement hotkeys enabled'
        : 'Measurement hotkeys disabled',
      disallowClose: true,
    });
  };

  // Module labels layer.

  const [isModuleLabelLayerEnabled, setModuleLabelLayerEnabled] =
    useLocalStorage<boolean>({
      key: 'moduleLabelLayerEnabled',
      defaultValue: true,
    });

  const toggleModuleLabelLayer = () => {
    const enable = !isModuleLabelLayerEnabled;
    setModuleLabelLayerEnabled(enable);
    showNotification({
      message: enable ? 'Module labels enabled' : 'Module labels disabled',
      disallowClose: true,
    });
  };

  // Media details layer.

  const [isMediaDetailsLayerEnabled, setMediaDetailsLayerEnabled] =
    useLocalStorage<boolean>({
      key: 'MediaDetailsLayerEnabled',
      defaultValue: true,
    });

  const toggleMediaDetailsLayer = () => {
    const enable = !isMediaDetailsLayerEnabled;
    setMediaDetailsLayerEnabled(enable);
    showNotification({
      message: enable ? 'Media details enabled' : 'Media details disabled',
      disallowClose: true,
    });
  };

  const [popoverOpened, setPopoverOpened] = useState(false);

  return (
    <>
      <NotificationsProvider position="bottom-center" autoClose={3000}>
        <MeasurementUtilityLayer enabled={isMeasurementLayerEnabled} />
        <AccessibilityTooltipLayer
          containerElement={props.containerElement}
          visible={isAccessibilityLayerEnabled}
        />
        <ModuleLabelLayer
          containerElement={props.containerElement}
          visible={isModuleLabelLayerEnabled}
        />
        <MediaDetailsLayer
          containerElement={props.containerElement}
          visible={isMediaDetailsLayerEnabled}
        />
        <Affix position={{bottom: 20, right: 20}}>
          <Button
            leftIcon={<LayersIcon />}
            color="dark"
            size="xs"
            variant="outline"
            onClick={() => setOpened(o => !o)}
          >
            Inspect
          </Button>
          <Dialog
            transition="slide-left"
            opened={opened}
            withCloseButton
            onClose={() => setOpened(false)}
            size="md"
            radius="md"
            position={{bottom: 80, right: 20}}
          >
            <Stack spacing="sm">
              <Title order={4}>Page tools</Title>
              <Select
                clearable
                value={screenSizeValue}
                onChange={setScreenSizeValue}
                itemComponent={ScreenSizeSimulatorSelectItem}
                placeholder="Simulate screen size"
                data={ScreenSizeSimulatorBreakpoints}
              />
              <Group position="apart">
                <Checkbox
                  label="Accessibility labels"
                  checked={isAccessibilityLayerEnabled}
                  onChange={toggleAccessibilityLayer}
                />
                <Text size="sm" color="gray">
                  <Kbd>⌃A</Kbd>
                </Text>
              </Group>
              {/* TODO: Implement grid overlay.
              <Group position="apart">
                <Checkbox label="Layout grids" />
                <Text color="gray">
                  <Kbd>⌃G</Kbd>
                </Text>
              </Group> */}
              <Group position="apart">
                <Checkbox
                  label="Measurement hotkeys"
                  checked={isMeasurementLayerEnabled}
                  onChange={toggleMeasurementLayer}
                />
                <Group>
                  <Popover
                    closeOnEscape={true}
                    closeOnClickOutside={true}
                    onClick={() => setPopoverOpened(!popoverOpened)}
                    opened={popoverOpened}
                    placement="end"
                    position="top"
                    transition="pop-bottom-right"
                    trapFocus={false}
                    width={350}
                    withCloseButton
                    withArrow
                    target={
                      <ThemeIcon variant="light">
                        <QuestionMarkCircledIcon />
                      </ThemeIcon>
                    }
                  >
                    <Text size="sm">
                      <p>
                        You can measure the size of an element and the distance
                        between two elements.
                      </p>
                      <ol>
                        <li>Enable the measurement hotkeys.</li>
                        <li>Hover over the first element.</li>
                        <li>
                          Hold down the modifier key: <Kbd>⌥ Option</Kbd>
                        </li>
                        <li>Hover over the second element.</li>
                        <li>
                          A line will be displayed between the two elements, as
                          well measurements in pixels.
                        </li>
                      </ol>
                    </Text>
                  </Popover>
                </Group>
              </Group>
              <Group position="apart">
                <Checkbox
                  label="Media details"
                  checked={isMediaDetailsLayerEnabled}
                  onChange={toggleMediaDetailsLayer}
                />
                <Text size="sm" color="gray">
                  <Kbd>⌃D</Kbd>
                </Text>
              </Group>
              <Group position="apart">
                <Checkbox
                  label="Module labels"
                  checked={isModuleLabelLayerEnabled}
                  onChange={toggleModuleLabelLayer}
                />
                <Text size="sm" color="gray">
                  <Kbd>⌃M</Kbd>
                </Text>
              </Group>
            </Stack>
          </Dialog>
        </Affix>
      </NotificationsProvider>
    </>
  );
}
