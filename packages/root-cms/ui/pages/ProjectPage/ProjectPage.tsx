import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {Layout} from '../../layout/Layout.js';
import './ProjectPage.css';

export function ProjectPage() {
  return (
    <Layout>
      <div className="ProjectPage">
        <Heading size="h1">Project</Heading>
        <Text as="p">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
          eiusmod tempor incididunt ut labore et dolore magna aliqua. Massa
          sapien faucibus et molestie ac. Scelerisque mauris pellentesque
          pulvinar pellentesque habitant morbi tristique. Praesent semper
          feugiat nibh sed pulvinar proin gravida hendrerit lectus. Volutpat
          odio facilisis mauris sit amet massa. Urna molestie at elementum eu
          facilisis. Egestas pretium aenean pharetra magna ac placerat
          vestibulum. Vitae nunc sed velit dignissim sodales ut eu sem. Volutpat
          consequat mauris nunc congue nisi vitae suscipit. Sagittis vitae et
          leo duis ut diam quam nulla.
        </Text>
        <Text as="p">
          Malesuada fames ac turpis egestas integer eget. A scelerisque purus
          semper eget duis at tellus. Ac turpis egestas sed tempus urna et
          pharetra. Feugiat vivamus at augue eget arcu dictum varius duis. Netus
          et malesuada fames ac turpis egestas. At consectetur lorem donec massa
          sapien faucibus. Natoque penatibus et magnis dis parturient montes.
          Auctor augue mauris augue neque gravida. Quam quisque id diam vel quam
          elementum pulvinar etiam non. Libero enim sed faucibus turpis in eu mi
          bibendum. Sodales ut eu sem integer vitae. Bibendum arcu vitae
          elementum curabitur vitae nunc sed.
        </Text>
      </div>
    </Layout>
  );
}
