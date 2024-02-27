import {Button, Textarea} from '@mantine/core';
import {ChangeEvent, useState} from 'preact/compat';
import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {Layout} from '../../layout/Layout.js';
import './TranslationsArbPage.css';

export function TranslationsArbPage() {
  return (
    <Layout>
      <div className="TranslationsArbPage">
        <div className="TranslationsArbPage__header">
          <Heading size="h1">ARB Translations</Heading>
          <Text as="p">
            Enter doc ids below (separated by newlines) to create a batch
            translations request in a single ARB file.
          </Text>
        </div>
        <TranslationsArbPage.RequestForm />
      </div>
    </Layout>
  );
}

TranslationsArbPage.RequestForm = () => {
  const [docIdsText, setDocIdsText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function onDownloadArb() {
    console.log('download arb');
    console.log(docIdsText);
    setLoading(true);
  }

  return (
    <form className="TranslationsArbPage__RequestForm">
      <Textarea
        size="xs"
        radius={0}
        autosize
        minRows={8}
        maxRows={20}
        value={docIdsText}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
          setDocIdsText(e.currentTarget.value || '');
        }}
      />
      <Button
        className="TranslationsArbPage__RequestForm__submit"
        color="blue"
        size="xs"
        loading={loading}
        onClick={() => onDownloadArb()}
      >
        Download ARB
      </Button>

      {error && (
        <Text as="p" className="TranslationsArbPage__RequestForm__error">
          {error}
        </Text>
      )}
    </form>
  );
};
