import {Box, Container, Group, Stack, Tabs, Text, Title} from '@mantine/core';
import {Link} from 'react-router-dom';
import {WebUIShell} from '../../components/WebUIShell/WebUIShell';
import {useProject} from '../../hooks/useProject';
import {MaterialIcon} from '../../icons/MaterialIcon';
import style from './ProjectPage.module.sass';

export function ProjectPage() {
  const project = useProject();
  return (
    <WebUIShell>
      <Box sx={theme => ({backgroundColor: theme.colors.gray[0]})}>
        <Stack spacing={0} sx={{padding: '40px 20px'}}>
          <Text weight="bold">Project</Text>
          <Title>{project.name || project.id}</Title>
        </Stack>
        <Tabs
          variant="outline"
          styles={{
            tabsList: {paddingLeft: 20},
            body: {paddingTop: 0},
            tabLabel: {fontSize: 14, fontWeight: 600},
          }}
        >
          <Tabs.Tab label="Content" icon={<MaterialIcon icon="folder" />}>
            <Box
              sx={theme => ({
                backgroundColor: theme.white,
                padding: '20px 40px',
              })}
            >
              <Stack spacing={0}>
                {project.collections.map(collection => (
                  <Box
                    key={collection.id}
                    sx={{
                      borderBottom: '1px solid #dedede',
                      padding: '20px 10px',
                    }}
                  >
                    <Link
                      to={`/cms/${project.id}/content/${collection.id}`}
                      style={{textDecoration: 'none'}}
                    >
                      <Title order={4}>{collection.id}</Title>
                    </Link>
                    <Text>{collection.description || ''}</Text>
                  </Box>
                ))}
              </Stack>
            </Box>
          </Tabs.Tab>
          <Tabs.Tab label="Roles" icon={<MaterialIcon icon="face" />}>
            <Box sx={theme => ({backgroundColor: theme.white, padding: 20})}>
              Roles
            </Box>
          </Tabs.Tab>
        </Tabs>
      </Box>
      {/* <Group p={40} align="flex-start" grow>
        <Stack>
          <Title order={2}>Content Types</Title>
          <Stack>
            {project.collections.map(collection => (
              <Box
                key={collection.id}
                sx={{
                  border: '1px solid #dedede',
                  borderRadius: 8,
                  padding: '20px 40px',
                }}
              >
                <Title order={4}>{collection.id}</Title>
                <Text>{collection.description || ''}</Text>
              </Box>
            ))}
          </Stack>
        </Stack>
        <Stack>
          <Title order={3}>Roles</Title>
        </Stack>
      </Group> */}
      {/* <div className={style.ProjectPage}>
        <div className={style.ProjectPage_CollectionsTitle}>Content Types</div>
        <div className={style.ProjectPage_Collections}>
          {project.collections.map(collection => (
            <div className={style.ProjectPage_Collection} key={collection.id}>
              <Link to={`/cms/${project.id}/content/${collection.id}`}>
                {collection.id}
              </Link>
            </div>
          ))}
        </div>
      </div> */}
    </WebUIShell>
  );
}
