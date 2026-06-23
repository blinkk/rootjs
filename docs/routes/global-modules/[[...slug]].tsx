import {Container} from '@/components/Container/Container.js';
import {Text} from '@/components/Text/Text.js';
import {UnstyledList} from '@/components/UnstyledList/UnstyledList.js';
import {testAllConditions} from '@/conditions/conditions.js';
import {FeatureFlag, FeatureFlagsContext} from '@/hooks/useFeatureFlags.js';
import {BaseLayout} from '@/layouts/BaseLayout';
import {GlobalModulesDoc} from '@/root-cms';
import {cmsRoute} from '@/utils/cms-route';
import styles from './global-modules.module.scss';

export interface PageProps {
  doc: GlobalModulesDoc;
}

export default function Page(props: PageProps) {
  const fields = props.doc?.fields || {};
  const flags: FeatureFlag[] = fields.flags || [];
  return (
    <BaseLayout title="Feature Flags" noindex>
      <Container className={styles.wrap}>
        <Text as="h1" size="h2">
          Feature Flags
        </Text>
        <Text className={styles.intro} size="p">
          Defined in <code>GlobalModules/flags</code>. A flag is enabled when
          all of its conditions pass.
        </Text>
        <FeatureFlagsContext.Provider value={flags}>
          {flags.length === 0 ? (
            <Text size="p">No flags defined yet.</Text>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Flag</th>
                  <th>Description</th>
                  <th>Conditions</th>
                  <th>Enabled?</th>
                </tr>
              </thead>
              <tbody>
                {flags.map((flag) => (
                  <FlagRow flag={flag} />
                ))}
              </tbody>
            </table>
          )}
        </FeatureFlagsContext.Provider>
      </Container>
    </BaseLayout>
  );
}

function FlagRow(props: {flag: FeatureFlag}) {
  const flag = props.flag;
  const conditions = flag.conditions || [];
  const enabled = testAllConditions(conditions);
  return (
    <tr>
      <td>{flag.name || ''}</td>
      <td>{flag.description || ''}</td>
      <td>
        {conditions.length === 0 ? (
          <span className={styles.muted}>(always enabled)</span>
        ) : (
          <UnstyledList>
            {conditions.map((condition: any) => (
              <li>
                {condition._type}
                {condition.flag ? `: ${condition.flag}` : ''}
              </li>
            ))}
          </UnstyledList>
        )}
      </td>
      <td className={styles.enabled}>{String(enabled)}</td>
    </tr>
  );
}

export const {handle} = cmsRoute({
  collection: 'GlobalModules',
  slugParam: 'slug',
  previewOnly: true,
});
