import {Breadcrumbs, Group, JsonInput, Title} from '@mantine/core';
import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {AppShell} from '../components/AppShell';
import {useDoc} from '../hooks/useDoc';

export function DocumentPage() {
  const doc = useDoc();
  const project = doc.project;
  const collection = doc.collection;
  const [content, setContent] = useState<any>({});

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
          style={{width: '100%'}}
        />
      </Group>
    </AppShell>
  );
}
