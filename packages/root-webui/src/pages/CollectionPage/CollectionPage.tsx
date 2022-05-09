import {
  Image,
  Title,
  Text,
  Group,
  Stack,
  Box,
  Tabs,
  Loader,
} from '@mantine/core';
import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {WebUIShell} from '../../components/WebUIShell/WebUIShell';
import {useCollection} from '../../hooks/useCollection';
import {useProject} from '../../hooks/useProject';
import {MaterialIcon} from '../../icons/MaterialIcon';
import {Collection} from '../../lib/Collection';

export function CollectionPage() {
  const project = useProject();
  const collection = useCollection();

  return (
    <WebUIShell>
      <Group
        spacing={0}
        align="flex-start"
        sx={{height: 'calc(100vh - 48px)', overflow: 'hidden'}}
      >
        <Stack spacing={0}>
          {project.collections.map(c => (
            <Box
              key={c.id}
              sx={theme => ({
                borderBottom: '1px solid #dedede',
                backgroundColor:
                  c.id === collection?.id ? theme.colors.gray[0] : theme.white,
              })}
            >
              <Link
                to={`/cms/content/${c.id}`}
                style={{textDecoration: 'none'}}
              >
                <Group
                  sx={theme => ({
                    minWidth: 280,
                    padding: '12px 20px',
                    color:
                      c.id === collection?.id
                        ? theme.black
                        : theme.colors.gray[7],
                  })}
                >
                  <MaterialIcon icon="folder" size={20} />
                  <Text size="sm" weight={600}>
                    {c.id}
                  </Text>
                  <MaterialIcon
                    icon="chevron_right"
                    style={{marginLeft: 'auto', marginRight: -8}}
                  />
                </Group>
              </Link>
            </Box>
          ))}
        </Stack>
        <Box sx={{borderLeft: '1px solid #dedede', height: '100%', flex: 1}}>
          {collection && (
            <Stack
              sx={theme => ({
                backgroundColor: theme.colors.gray[0],
                height: '100%',
                overflow: 'auto',
              })}
            >
              <Stack spacing={4} sx={{padding: '20px 20px'}}>
                <Title order={2}>{collection?.id}</Title>
                {collection?.description && (
                  <Text size="sm">{collection.description}</Text>
                )}
              </Stack>
              <Tabs
                variant="outline"
                styles={theme => ({
                  root: {flex: 1, display: 'flex', flexDirection: 'column'},
                  tabsList: {paddingLeft: 20},
                  body: {
                    padding: '20px',
                    flex: 1,
                    backgroundColor: theme.white,
                  },
                  tabLabel: {fontSize: 14, fontWeight: 600},
                })}
              >
                <Tabs.Tab
                  label="Documents"
                  icon={<MaterialIcon icon="article" />}
                >
                  <CollectionPage.DocumentsTab collection={collection} />
                </Tabs.Tab>
                <Tabs.Tab label="Roles" icon={<MaterialIcon icon="face" />}>
                  <CollectionPage.RolesTab />
                </Tabs.Tab>
              </Tabs>
            </Stack>
          )}
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
    setLoading(false);
  }

  useEffect(() => {
    listDocs();
  }, [collection.id]);

  if (loading) {
    return <Loader />;
  }

  return (
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
            to={`/cms/content/${collection.id}/${doc.slug}`}
            style={{textDecoration: 'none'}}
          >
            <Group>
              <Image width={120} height={90} withPlaceholder />
              <Stack spacing={0}>
                <Text size="sm">{doc.slug}</Text>
                <Title order={2}>{doc.draft?.meta?.title || 'Untitled'}</Title>
              </Stack>
            </Group>
          </Link>
        </Box>
      ))}
    </Stack>
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
  return <Title>Roles</Title>;
};
