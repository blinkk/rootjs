import {GetStaticProps} from '@blinkk/root';

/**
 * Uses import.meta.glob to discover all components in the components directory.
 * This pattern is commonly used to build component libraries, documentation sites,
 * or any page that needs to list/display multiple modules dynamically.
 */
const componentModules = import.meta.glob('./components/*.tsx', {eager: true});

interface ComponentInfo {
  name: string;
  path: string;
  metadata?: {
    name: string;
    description: string;
  };
}

interface Props {
  components: ComponentInfo[];
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  // Extract component info from the glob result.
  const components: ComponentInfo[] = Object.entries(componentModules).map(
    ([filePath, module]: [string, any]) => ({
      name: filePath.replace('./components/', '').replace('.tsx', ''),
      path: filePath,
      metadata: module.metadata,
    })
  );

  // Sort components alphabetically by name.
  components.sort((a, b) => a.name.localeCompare(b.name));

  return {props: {components}};
};

export default function ComponentList(props: Props) {
  const {components} = props;
  return (
    <div>
      <h1>Component Library</h1>
      <p>Found {components.length} components</p>
      <ul>
        {components.map((comp) => (
          <li key={comp.name}>
            <strong>{comp.metadata?.name || comp.name}</strong>
            {comp.metadata?.description && (
              <span> - {comp.metadata.description}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
