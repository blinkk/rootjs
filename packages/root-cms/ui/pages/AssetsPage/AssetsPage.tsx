import {Button} from '@mantine/core';
import {useState} from 'preact/hooks';
import {FileUploader} from '../../components/DocEditor/fields/FileField.js';
import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {Layout} from '../../layout/Layout.js';
import './AssetsPage.css';

export function AssetsPage() {
  const [file, setFile] = useState<any>(null);

  return (
    <Layout>
      <div className="AssetsPage">
        <div className="AssetsPage__header">
          <Heading size="h1">Assets</Heading>
          <Text as="p">Upload assets to the project's GCS bucket.</Text>
        </div>
        <div style={{maxWidth: 520, width: '100%'}}>
          <FileUploader
            value={file}
            onChange={setFile}
            showNamingOptions
            accept={['*/*']}
            allowEditing={false}
            className="AssetsPage__uploader"
          />
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
