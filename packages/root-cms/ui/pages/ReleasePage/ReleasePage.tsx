import {
  ActionIcon,
  Breadcrumbs,
  Button,
  Loader,
  Table,
  Tooltip,
} from '@mantine/core';
import {IconSettings} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {Layout} from '../../layout/Layout.js';
import './ReleasePage.css';
import {Release, getRelease} from '../../utils/release.js';
import {DocPreviewCard} from '../../components/DocPreviewCard/DocPreviewCard.js';

export function ReleasePage(props: {id: string}) {
  const [loading, setLoading] = useState(true);
  const [release, setRelease] = useState<Release | null>(null);
  const id = props.id;

  async function init() {
    const release = await getRelease(id);
    setRelease(release);
    setLoading(false);
  }

  useEffect(() => {
    init();
  }, []);

  return (
    <Layout>
      <div className="ReleasePage">
        <div className="ReleasePage__header">
          <Breadcrumbs className="ReleasePage__header__breadcrumbs">
            <a href="/cms/releases">Releases</a>
            <div>{id}</div>
          </Breadcrumbs>
          <div className="ReleasePage__header__titleWrap">
            <Heading size="h1">Release: {id}</Heading>
            <div className="ReleasePage__header__controls">
              <Tooltip label="Configure">
                <ActionIcon
                  component="a"
                  href={`/cms/releases/${props.id}/edit`}
                >
                  <IconSettings size={24} stroke="1.5" />
                </ActionIcon>
              </Tooltip>
            </div>
          </div>
          {release?.description && <Text as="p">{release.description}</Text>}
        </div>

        {release && <ReleasePage.PublishStatus release={release} />}
        {release && release.docIds && release.docIds.length > 0 && (
          <ReleasePage.DocsList release={release} />
        )}
      </div>
    </Layout>
  );
}

ReleasePage.PublishStatus = (props: {release: Release}) => {
  const release = props.release;
  return (
    <div className="ReleasePage__PublishStatus">
      <Heading size="h2">Status</Heading>
      <Table verticalSpacing="xs" striped fontSize="xs">
        <thead>
          <tr>
            <th>published?</th>
            <th>actions</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>never</td>
            <td>
              <div className="ReleasePage__PublishStatus__actions">
                <Button variant="default" size="xs" compact>
                  Publish
                </Button>
                <Button variant="default" size="xs" compact>
                  Schedule
                </Button>
              </div>
            </td>
          </tr>
        </tbody>
      </Table>
    </div>
  );
};

ReleasePage.DocsList = (props: {release: Release}) => {
  const release = props.release;
  const docIds = release.docIds || [];
  return (
    <div className="ReleasePage__DocsList">
      <div className="ReleasePage__DocsList__header">
        <Heading size="h2">Docs</Heading>
        <Button
          component="a"
          variant="default"
          size="xs"
          compact
          href={`/cms/releases/${release.id}/edit`}
        >
          Edit
        </Button>
      </div>
      <div className="ReleasePage__DocsList__cards">
        {docIds.map((docId) => (
          <div className="ReleasePage__DocsList__card">
            <a href={`/cms/content/${docId}`}>
              <DocPreviewCard docId={docId} statusBadges />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
};
