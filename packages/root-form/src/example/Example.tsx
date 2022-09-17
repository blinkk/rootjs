import {
  AppShell,
  Grid,
  Header,
  Stack,
  Text,
  Textarea,
  useMantineTheme,
} from '@mantine/core';
import {RootForm, RootFormConfig} from '../RootForm';
import {useState} from 'react';
// eslint-disable-next-line node/no-unpublished-import
import yaml from 'js-yaml';

export function Example() {
  const theme = useMantineTheme();

  const [rawOriginalValue, setRawOriginalValue] = useState(`
title: The stuff dreams are made of.
`);

  const [originalValue, setOriginalValue] = useState(
    yaml.load(rawOriginalValue)
  );

  const [currentValue, setCurrentValue] = useState({});

  const [rawConfiguration, setRawConfiguration] = useState(`
fields:
- id: title
  type: text
  label: Title
  help: Title for the data.
`);

  const [configuration, setConfiguration] = useState(
    yaml.load(rawConfiguration)
  );

  const [output, setOutput] = useState(rawOriginalValue);

  return (
    <AppShell
      styles={{
        main: {
          background:
            theme.colorScheme === 'dark'
              ? theme.colors.dark[8]
              : theme.colors.gray[0],
        },
      }}
      fixed
      header={
        <Header height={60} p="md">
          <Text size="lg" weight="700">
            Root Form Example
          </Text>
        </Header>
      }
    >
      <Grid gutter="md">
        <Grid.Col span={6}>
          <Stack justify="space-around">
            <Textarea
              autosize
              label="Original value (YAML)"
              onChange={(event) => {
                try {
                  setRawOriginalValue(event.currentTarget.value);
                  setOriginalValue(yaml.load(event.currentTarget.value));
                } catch (error) {
                  // Ignore parsing errors since it may trigger with invalid json.
                }
              }}
              placeholder="Original value"
              required
              value={rawOriginalValue.trim()}
            />
            <Textarea
              autosize
              label="Field configuration (YAML)"
              onChange={(event) => {
                try {
                  setRawConfiguration(event.currentTarget.value);
                  setConfiguration(yaml.load(event.currentTarget.value));
                } catch (error) {
                  // Ignore parsing errors since it may trigger with invalid json.
                }
              }}
              placeholder="Field configuration"
              required
              value={rawConfiguration.trim()}
            />
            <Textarea
              autosize
              readOnly
              label="Updated Value"
              placeholder="Updated Value"
              value={output.trim()}
            />
          </Stack>
        </Grid.Col>
        <Grid.Col span={5}>
          <RootForm
            currentValue={currentValue as Record<string, unknown>}
            originalValue={originalValue as Record<string, unknown>}
            configuration={configuration as RootFormConfig}
            setValue={(value: Record<string, unknown>) => {
              setCurrentValue(value);
              setOutput(yaml.dump(value));
            }}
          ></RootForm>
        </Grid.Col>
      </Grid>
    </AppShell>
  );
}
