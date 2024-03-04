import {Button, Loader, Table} from '@mantine/core';
import {useEffect, useState} from 'preact/hooks';
import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {Layout} from '../../layout/Layout.js';
import './ReleasesPage.css';

export function ReleasesPage() {
  return (
    <Layout>
      <div className="ReleasesPage">
        <div className="ReleasesPage__header">
          <Heading size="h1">Releases</Heading>
          <Text as="p">
            Create a release for publishing a group of docs together in a batch.
          </Text>
          <div className="ReleasesPage__header__buttons">
            <Button
              component="a"
              color="blue"
              size="xs"
              href="/cms/releases/new"
            >
              New release
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
