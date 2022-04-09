import {Breadcrumbs, Button, Group, JsonInput, Title} from '@mantine/core';
import {useModals} from '@mantine/modals';
import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {AppShell} from '../components/AppShell';
import {
  PublishDocModal,
  PublishDocModalConfirmProps,
} from '../components/PublishDocModal/PublishDocModal';
import {useDoc} from '../hooks/useDoc';
import {useNotifications} from '@mantine/notifications';

export function DocumentPage() {
  const doc = useDoc();
  const project = doc.project;
  const collection = doc.collection;
  const [content, setContent] = useState<any>({});
  const [publishModalOpened, setPublishModalOpened] = useState(false);

  const notifications = useNotifications();

  const breadcrumbs = [
    {title: project.id, href: `/cms/${project.id}`},
    {title: collection.id, href: `/cms/${project.id}/content/${collection.id}`},
    {
      title: doc.slug,
      href: `/cms/${project.id}/content/${collection.id}/${doc.slug}`,
    },
  ].map((item, index) => (
    <Link to={item.href} key={index}>
      {item.title}
    </Link>
  ));

  const fetchDocContent = async () => {
    if (!doc) {
      return;
    }
    console.log('fetching content');
    const content = await doc.getContent();
    console.log(content);
    setContent(content);
  };

  useEffect(() => {
    fetchDocContent();
  }, []);

  async function publish(value: PublishDocModalConfirmProps) {
    setPublishModalOpened(false);
    if (!doc) {
      return;
    }
    console.log('publishing doc: ' + value.docId);
    const notifId = `publish-doc-${value.docId}`;
    notifications.showNotification({
      id: notifId,
      title: 'Publishing...',
      message: 'Publishing ${value.docId}...',
      autoClose: false,
      disallowClose: true,
    });
    await doc.publish(content);
    notifications.updateNotification(notifId, {
      title: 'Published!',
      message: `Successfully published ${value.docId}`,
      color: 'teal',
      autoClose: false,
    });
  }

  async function saveDraft() {
    if (!doc) {
      return;
    }
    await doc.saveDraft(content);
    notifications.showNotification({
      title: 'Saved!',
      message: 'Saved draft',
    });
  }

  return (
    <AppShell>
      <Breadcrumbs>{breadcrumbs}</Breadcrumbs>
      <Group direction="column" sx={{marginTop: 20}} spacing={10}>
        <Title>{doc.id}</Title>

        <Title order={2}>Content</Title>
        <JsonInput
          label="Draft Data"
          validationError="Invalid json"
          formatOnBlur
          autosize
          minRows={4}
          value={JSON.stringify(content, null, 2)}
          onChange={value => setContent(JSON.parse(value))}
          style={{width: '100%'}}
        />
        <Button onClick={() => saveDraft()}>Save</Button>
        <Button onClick={() => setPublishModalOpened(true)}>Publish</Button>
      </Group>
      <PublishDocModal
        docId={doc.id}
        opened={publishModalOpened}
        onClose={() => setPublishModalOpened(false)}
        onConfirm={publish}
      />
    </AppShell>
  );
}
