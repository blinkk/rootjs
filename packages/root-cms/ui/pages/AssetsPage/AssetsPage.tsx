import {ActionIcon, Button, Textarea, Tooltip} from '@mantine/core';
import {IconCopy} from '@tabler/icons-preact';
import {useState} from 'preact/hooks';
import {FileUploader} from '../../components/DocEditor/fields/FileUploader.js';
import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {Layout} from '../../layout/Layout.js';
import './AssetsPage.css';

export function AssetsPage() {
  const [file, setFile] = useState<any>(null);
  const gcsUrl = file?.gcsPath
    ? `https://storage.googleapis.com${file.gcsPath}`
    : '';

  return (
    <Layout>
      <div className="AssetsPage" data-testid="assets-page">
        <div className="AssetsPage__header">
          <Heading size="h1">Assets</Heading>
          <Text as="p">Upload assets to the project's GCS bucket.</Text>
        </div>
        <div style={{maxWidth: 600, width: '100%'}}>
          <FileUploader
            value={file}
            onChange={setFile}
            showNamingOptions
            accept={['*/*']}
            allowEditing={false}
            className="AssetsPage__uploader"
          />
          {file && gcsUrl && (
            <div className="AssetsPage__urlGroup">
              <UrlRow label="GCS URL" url={gcsUrl} />
              <UrlRow label="Google Image Service URL" url={file.src} />
            </div>
          )}
          {file && !gcsUrl && (
            <div className="AssetsPage__urlGroup">
              <UrlRow url={file.src} />
            </div>
          )}
          {file && (
            <Button
              variant="outline"
              fullWidth
              onClick={() => setFile(null)}
              mt="md"
            >
              Upload another file
            </Button>
          )}
        </div>
      </div>
    </Layout>
  );
}

function UrlRow(props: {label?: string; url: string}) {
  return (
    <div className="AssetsPage__urlRow">
      {props.label && (
        <div className="AssetsPage__urlRow__label">{props.label}</div>
      )}
      <div className="AssetsPage__urlRow__input">
        <Textarea
          readOnly
          value={props.url}
          autosize
          minRows={1}
          size="xs"
          radius="xs"
          onClick={(e: Event) =>
            (e.target as HTMLTextAreaElement).select()
          }
          styles={{root: {flex: 1, minWidth: 0}}}
        />
        <CopyButton url={props.url} />
      </div>
    </div>
  );
}

function CopyButton(props: {url: string}) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip label={copied ? 'Copied!' : 'Copy URL'} position="top" withArrow>
      <ActionIcon
        variant="default"
        size="lg"
        onClick={() => {
          navigator.clipboard.writeText(props.url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        <IconCopy size={16} />
      </ActionIcon>
    </Tooltip>
  );
}
