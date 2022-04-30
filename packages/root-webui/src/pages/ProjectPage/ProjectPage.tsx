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
            <ProjectPage.ContentTab project={project} />
          </Tabs.Tab>
          <Tabs.Tab label="Roles" icon={<MaterialIcon icon="face" />}>
            <ProjectPage.RolesTab />
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
    <Box
      sx={theme => ({
        backgroundColor: theme.white,
        padding: '20px 30px',
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
  );
};

interface RolesTabProps {
}

ProjectPage.RolesTab = function (props: RolesTabProps) {
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
