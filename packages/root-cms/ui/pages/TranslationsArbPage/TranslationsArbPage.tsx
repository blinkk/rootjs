import {Button, Textarea} from '@mantine/core';
import {ChangeEvent, useState} from 'preact/compat';
import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {Layout} from '../../layout/Layout.js';
import './TranslationsArbPage.css';
import {Arb} from '../../utils/arb.js';
import {getDraftDocs} from '../../utils/doc.js';
import {extractFields} from '../../utils/extract.js';
import {sourceHash} from '../../utils/l10n.js';

export function TranslationsArbPage() {
  return (
    <Layout>
      <div className="TranslationsArbPage">
        <div className="TranslationsArbPage__header">
          <Heading size="h1">ARB Translations</Heading>
          <Text as="p">
            Enter doc ids below (separated by newlines) to include in an ARB
            file.
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
    try {
      setLoading(true);
      console.log('download arb');
      const docIds = parseDocIds(docIdsText);
      const drafts = await getDraftDocs(docIds);
      const arb = new Arb();

      const rootConfig = window.__ROOT_CTX.rootConfig;
      const websiteUrlParts = [rootConfig.domain];
      if (rootConfig.base && rootConfig.base !== '/') {
        websiteUrlParts.push(rootConfig.base);
      }
      const websiteUrl = websiteUrlParts.join('');

      arb.setMeta({
        locale: 'en',
        context: websiteUrl,
        last_modified: new Date().toISOString(),
      });
      console.log(drafts);

      await Promise.all(
        Object.entries(drafts).map(async ([docId, draft]) => {
          const strings = new Set<string>();
          const collectionId = docId.split('/')[0];
          const collection = window.__ROOT_CTX.collections[collectionId];
          if (!collection) {
            console.log(`not found: ${collectionId}`);
            return;
          }
          extractFields(strings, collection.fields, draft.fields || {});

          for (const source of strings) {
            const hash = await sourceHash(source);
            let meta = arb.get(hash)?.meta;
            if (meta) {
              const contextIds = meta.context!.split(', ');
              contextIds.push(docId);
              contextIds.sort();
              meta.context = contextIds.join(', ');
            } else {
              meta = {
                context: docId,
              };
            }
            arb.add(hash, source, meta);
          }
        })
      );

      const arbContent = arb.toString();
      const res = new Response(arbContent);
      const blob = await res.blob();
      const file = window.URL.createObjectURL(blob);

      const windowTab = window.open(file, '_blank');
      if (windowTab) {
        windowTab.focus();
      }
      // window.location.assign(file);
      window.URL.revokeObjectURL(file);

      setLoading(false);
    } catch (err) {
      console.error(err);
      setError(`failed to download arb: ${err}`);
    }
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
        placeholder="Pages/index"
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

function parseDocIds(docIdsText: string): string[] {
  return docIdsText
    .split('\n')
    .map((docId) => docId.trim())
    .filter((docId) => testValidDocId(docId));
}

function testValidDocId(docId: string): boolean {
  return !!docId && docId.includes('/') && docId.split('/').length === 2;
}
