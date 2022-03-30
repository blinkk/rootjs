import {Breadcrumbs, Title, Text, Group} from '@mantine/core';
import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {AppShell} from '../components/AppShell';
import {useCollection} from '../hooks/useCollection';

export function CollectionPage() {
  const collection = useCollection();
  const project = collection.project;
  const [docs, setDocs] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);

  const listDocs = async () => {
    if (!project) {
      return;
    }
    console.log(`listing docs in ${collection.id}`);
    const docs = await collection.listDocs();
    setDocs(docs);
  };

  const getRoles = async () => {
    if (!project) {
      return;
    }
    const rolesMap = await collection.getRoles();
    const roles: any[] = [];
    for (const email in rolesMap) {
      roles.push({email: email, role: rolesMap[email]});
    }
    setRoles(roles);
  };

  useEffect(() => {
    getRoles();
    listDocs();
  }, [project.id]);

  const breadcrumbs = [
    {title: project.id, href: `/cms/${project.id}`},
    {title: collection.id, href: `/cms/${project.id}/content/${collection.id}`},
  ].map((item, index) => (
    <Link to={item.href} key={index}>
      {item.title}
    </Link>
  ));
  return (
    <AppShell>
      <Breadcrumbs>{breadcrumbs}</Breadcrumbs>
      <Group direction="column" sx={{marginTop: 20}} spacing={10}>
        <Title>{collection.id}</Title>
        {collection.description && <Text>{collection.description}</Text>}

        <Title order={2}>Roles</Title>
        <Group direction="column" spacing={10}>
          {roles.map(role => (
            <div key={role.email}>
              {role.email}: {role.role}
            </div>
          ))}
        </Group>

        <Title order={2}>Docs</Title>
        <Group direction="column" spacing={10}>
          {docs.map(doc => (
            <Link
              to={`/cms/${project.id}/content/${collection.id}/${doc.slug}`}
              key={doc.slug}
            >
              {doc.draft.meta.title} ({doc.slug})
            </Link>
          ))}
        </Group>
      </Group>
    </AppShell>
  );
}
