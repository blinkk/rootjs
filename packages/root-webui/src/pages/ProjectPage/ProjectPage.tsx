import {Box, Stack, Tabs, Text, Title} from '@mantine/core';
import {Link} from 'react-router-dom';
import {WebUIShell} from '../../components/WebUIShell/WebUIShell';
import {useProject} from '../../hooks/useProject';
import {MaterialIcon} from '../../icons/MaterialIcon';
import {Project} from '../../lib/Project';

export function ProjectPage() {
  const project = useProject();
  return (
    <WebUIShell>
      <Box sx={theme => ({backgroundColor: theme.colors.gray[0]})}>
        <Stack spacing={0} sx={{padding: '30px 20px'}}>
          <Text size="sm" weight={600}>
            Project
          </Text>
          <Title order={2}>{project.name || project.id}</Title>
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
          <Tabs.Tab label="Content" icon={<MaterialIcon icon="folder" />}>
            <ProjectPage.ContentTab project={project} />
          </Tabs.Tab>
          <Tabs.Tab label="Roles" icon={<MaterialIcon icon="face" />}>
            <ProjectPage.RolesTab />
          </Tabs.Tab>
          <Tabs.Tab label="Settings" icon={<MaterialIcon icon="settings" />}>
            <ProjectPage.SettingsTab />
          </Tabs.Tab>
        </Tabs>
      </Box>
    </WebUIShell>
  );
}

interface ContentTabProps {
  project: Project;
}

ProjectPage.ContentTab = function (props: ContentTabProps) {
  const project = props.project;
  return (
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
            to={`/cms/content/${collection.id}`}
            style={{textDecoration: 'none'}}
          >
            <Title order={4}>{collection.id}</Title>
          </Link>
          <Text size="sm">{collection.description || ''}</Text>
        </Box>
      ))}
    </Stack>
  );
};

ProjectPage.RolesTab = function () {
  return <Title>Roles</Title>;
};

ProjectPage.SettingsTab = function () {
  return <Title>Settings</Title>;
};
