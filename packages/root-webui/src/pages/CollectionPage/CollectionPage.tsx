import {
  Image,
  Title,
  Text,
  Group,
  Stack,
  Box,
  Tabs,
  Col,
  Loader,
} from '@mantine/core';
import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {WebUIShell} from '../../components/WebUIShell/WebUIShell';
import {useCollection} from '../../hooks/useCollection';
import {MaterialIcon} from '../../icons/MaterialIcon';
import {Collection} from '../../lib/Collection';

export function CollectionPage() {
  const collection = useCollection();
  const project = collection.project;

  return (
    <WebUIShell>
      <Group
        spacing={0}
        align="flex-start"
        sx={{height: 'calc(100vh - 48px)', overflow: 'hidden'}}
      >
        <Stack spacing={0}>
          {project.collections.map(collection => (
            <Box
              key={collection.id}
              sx={{
                borderBottom: '1px solid #dedede',
              }}
            >
              <Link
                to={`/cms/${project.id}/content/${collection.id}`}
                style={{textDecoration: 'none'}}
              >
                <Group sx={{minWidth: 280, padding: '16px 20px'}}>
                  <MaterialIcon icon="folder" />
                  <Text size="sm" weight="bold">
                    {collection.id}
                  </Text>
                  <MaterialIcon
                    icon="chevron_right"
                    style={{marginLeft: 'auto'}}
                  />
                </Group>
              </Link>
            </Box>
          ))}
        </Stack>
        <Box sx={{borderLeft: '1px solid #dedede', height: '100%', flex: 1}}>
          <Box sx={theme => ({backgroundColor: theme.colors.gray[0]})}>
            <Stack sx={{padding: '20px 20px'}}>
              <Title>{collection.id}</Title>
            </Stack>
            <Tabs
              variant="outline"
              styles={{
                tabsList: {paddingLeft: 20},
                body: {paddingTop: 0},
                tabLabel: {fontSize: 14, fontWeight: 600},
              }}
            >
              <Tabs.Tab label="Documents" icon={<MaterialIcon icon="draft" />}>
                <CollectionPage.DocumentsTab collection={collection} />
              </Tabs.Tab>
              <Tabs.Tab label="Roles" icon={<MaterialIcon icon="face" />}>
                <CollectionPage.RolesTab />
              </Tabs.Tab>
            </Tabs>
          </Box>
        </Box>
      </Group>
    </WebUIShell>
  );
}

interface DocumentsTabProps {
  collection: Collection;
}

CollectionPage.DocumentsTab = (props: DocumentsTabProps) => {
  const collection = props.collection;
  const project = collection.project;
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function listDocs() {
    if (!project) {
      return;
    }
    const docs = await collection.listDocs();
    setDocs(docs);
    console.log(docs);
    setLoading(false);
  }

  useEffect(() => {
    listDocs();
  }, [collection.id]);

  if (loading) {
    return <Loader />;
  }

  return (
    <Box
      sx={theme => ({
        backgroundColor: theme.white,
        padding: '20px 40px',
      })}
    >
      <Stack spacing={0}>
        {docs.map(doc => (
          <Box
            key={doc.slug}
            sx={{
              borderBottom: '1px solid #dedede',
              padding: '20px 10px',
            }}
          >
            <Link
              to={`/cms/${project.id}/content/${collection.id}/${doc.slug}`}
              style={{textDecoration: 'none'}}
            >
              <Group>
                <Image width={120} height={90} withPlaceholder />
                <Stack spacing={0}>
                  <Text size="sm">{doc.slug}</Text>
                  <Title order={2}>
                    {doc.draft?.meta?.title || 'Untitled'}
                  </Title>
                </Stack>
              </Group>
            </Link>
          </Box>
        ))}
      </Stack>
    </Box>
  );
};

CollectionPage.RolesTab = () => {
  // const getRoles = async () => {
  //   if (!project) {
  //     return;
  //   }
  //   const rolesMap = await collection.getRoles();
  //   const roles: any[] = [];
  //   for (const email in rolesMap) {
  //     roles.push({email: email, role: rolesMap[email]});
  //   }
  //   setRoles(roles);
  // };
  return (
    <Box
      sx={theme => ({
        backgroundColor: theme.white,
        padding: '20px 40px',
      })}
    >
      Roles
    </Box>
  );
};
