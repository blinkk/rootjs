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
import {useDocData} from '../../hooks/useDocData';
import {MaterialIcon} from '../../icons/MaterialIcon';
import {Doc} from '../../lib/Doc';

interface ContentTabProps {
  doc: Doc;
}

export function ContentTab(props: ContentTabProps) {
  const doc = props.doc;
  const docData = useDocData(props.doc.id, {mode: 'draft'});
  const [value, setValue] = useState('');
  const modals = useModals();

  useEffect(() => {
    setValue(JSON.stringify(docData.content, null, 2));
  }, [docData.content]);

  if (docData.loading) {
    return <Loader variant="oval" />;
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
