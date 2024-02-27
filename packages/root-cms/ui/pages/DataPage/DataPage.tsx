import {Button} from '@mantine/core';
import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {Layout} from '../../layout/Layout.js';
import './DataPage.css';

export function DataPage() {
  return (
    <Layout>
      <div className="DataPage">
        <div className="DataPage__header">
          <Heading size="h1">Data Sources</Heading>
          <Text as="p">Add a data source to sync data from Google Sheets.</Text>
          <div className="DataPage__header__buttons">
            <Button component="a" color="blue" size="xs" href="/cms/data/new">
              Add data source
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
