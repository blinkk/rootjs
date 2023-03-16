import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {Layout} from '../../layout/Layout.js';
import './ProjectPage.css';

export function ProjectPage() {
  return (
    <Layout>
      <div className="ProjectPage">
        <Heading size="h1">Project Home</Heading>
        <Text as="p">
          This page is currently under construction, but the current idea is to
          have collaborative features here, such as a shared whiteboard (e.g.
          Notion style) that can be used to provide an overview of the project,
          timelines and milestones, important links (e.g. Figma), etc.
        </Text>
        <Text as="p">
          There should also be a dashboard here that shows upcoming scheduled
          releases, and maybe common user controls like a share box.
        </Text>
      </div>
    </Layout>
  );
}
