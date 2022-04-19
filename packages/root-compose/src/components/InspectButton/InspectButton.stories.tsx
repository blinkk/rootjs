import {Button, Container, Space, Text, Title} from '@mantine/core';
import {Meta, Story} from '@storybook/react';
import {InspectButton, InspectButtonProps} from './InspectButton';

import {useRef} from 'react';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'page-module': unknown;
    }
  }
}

const meta: Meta = {
  title: 'Compose UI/Inspect Button',
  component: InspectButton,
};

export default meta;

const Template = (props: InspectButtonProps) => {
  const containerElement = useRef<HTMLDivElement>(null);
  return (
    <main ref={containerElement}>
      <page-module template="Spacer">
        <Space h={100} />
      </page-module>
      <page-module template="LoremIpsum">
        <Container>
          <Title role="heading" aria-level={2}>
            Lorem ipsum dolor sit amet
          </Title>
          <Text component="p">
            Labore sint et duis do ipsum laborum ad ex veniam. Sit esse ullamco
            dolore consectetur dolore qui voluptate id est enim labore esse
            fugiat. Eiusmod consequat ex incididunt in sint esse eu. Nulla et
            exercitation sit fugiat Lorem duis sit. Excepteur irure velit magna
            officia.
          </Text>
          <Text component="p">
            Exercitation dolore laboris ad excepteur quis Lorem velit magna
            officia excepteur consectetur. Sint ea consectetur aliqua dolore
            veniam deserunt consequat deserunt velit in do. Non magna
            exercitation laborum elit anim est nisi qui laboris ut aute. Non
            cillum qui sint in fugiat.
          </Text>
          <Text component="p">
            <Button aria-label="Learn more about example">Learn more</Button>
          </Text>
          <Text component="p">
            Et ut ullamco labore reprehenderit deserunt sint. Laborum elit
            nostrud aute laboris quis aliquip adipisicing dolore eu. Ullamco
            Lorem cupidatat ullamco duis occaecat nostrud duis incididunt anim
            dolor consectetur excepteur.
          </Text>
          <img
            width="640"
            height="480"
            src="https://placeholder-dot-madebygoog.appspot.com/640x480.svg"
            alt="Tempor ullamco aliquip esse id ea nulla quis adipisicing adipisicing commodo."
          />
        </Container>
      </page-module>
      <page-module template="Spacer">
        <Space h={100} />
      </page-module>
      <page-module template="LoremIpsum">
        <Container>
          <Title order={2} role="heading" aria-level={3}>
            Lorem ipsum dolor sit amet
          </Title>
          <Text component="p">
            Labore sint et duis do ipsum laborum ad ex veniam. Sit esse ullamco
            dolore consectetur dolore qui voluptate id est enim labore esse
            fugiat. Eiusmod consequat ex incididunt in sint esse eu. Nulla et
            exercitation sit fugiat Lorem duis sit. Excepteur irure velit magna
            officia.
          </Text>
          <Text component="p">
            Exercitation dolore laboris ad excepteur quis Lorem velit magna
            officia excepteur consectetur. Sint ea consectetur aliqua dolore
            veniam deserunt consequat deserunt velit in do. Non magna
            exercitation laborum elit anim est nisi qui laboris ut aute. Non
            cillum qui sint in fugiat.
          </Text>
        </Container>
      </page-module>
      <InspectButton containerElement={containerElement} {...props} />
    </main>
  );
};

export const Default: Story<InspectButtonProps> = Template.bind({});
Default.args = {};
