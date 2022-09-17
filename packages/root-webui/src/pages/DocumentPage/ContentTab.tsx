import {
  Button,
  Group,
  JsonInput,
  Loader,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {useModals} from '@mantine/modals';
import {useEffect, useState} from 'react';
import {useDocContent} from '../../hooks/useDocContent';
import {MaterialIcon} from '../../icons/MaterialIcon';
import {Doc} from '../../lib/Doc';

interface ContentTabProps {
  doc: Doc;
}

export function ContentTab(props: ContentTabProps) {
  const doc = props.doc;
  const {content, isLoading, isError} = useDocContent(doc.id, {mode: 'draft'});
  const [value, setValue] = useState('');
  const modals = useModals();

  useEffect(() => {
    setValue(JSON.stringify(content, null, 2));
  }, [content]);

  if (isLoading) {
    return <Loader variant="oval" />;
  }
  if (isError) {
    return <Text>Error</Text>;
  }

  function openModuleLibrary() {
    modals.openModal({
      id: 'module-library',
      title: 'Add module',
      children: <Title>TODO</Title>,
      size: 'lg',
    });
  }

  return (
    <Stack>
      <JsonInput
        value={value}
        onChange={setValue}
        validationError="Invalid json"
        formatOnBlur
        autosize
        minRows={30}
      />
      <Group>
        <Button
          leftIcon={<MaterialIcon icon="add" style={{marginLeft: -8}} />}
          onClick={openModuleLibrary}
        >
          Add module
        </Button>
      </Group>
    </Stack>
  );
}

type ContentTabPreviewProps = {};

ContentTab.Preview = (props: ContentTabPreviewProps) => {
  return <>Content Preview</>;
};
