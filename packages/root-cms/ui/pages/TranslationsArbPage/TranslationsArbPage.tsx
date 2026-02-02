import {Breadcrumbs, Button, Table, Textarea} from '@mantine/core';
import {IconFileDownload} from '@tabler/icons-preact';
import {ChangeEvent, useState} from 'preact/compat';
import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {Layout} from '../../layout/Layout.js';
import {Arb} from '../../utils/arb.js';
import {fetchCollectionSchema} from '../../utils/collection.js';
import {getDraftDocs} from '../../utils/doc.js';
import {extractStringsWithMetadataForDoc} from '../../utils/extract.js';
import {sourceHash} from '../../utils/l10n.js';

import './TranslationsArbPage.css';

export function TranslationsArbPage() {
  return (
    <Layout>
      <div className="TranslationsArbPage">
        <div className="TranslationsArbPage__header">
          <Breadcrumbs className="TranslationsArbPage__header__breadcrumbs">
            <a href="/cms/translations">Translations</a>
            <div>ARB</div>
          </Breadcrumbs>
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
  const [preview, setPreview] = useState(null as Arb | null);

  async function buildArbFile(docIds: string[]) {
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

    for (const docId in drafts) {
      const draft = drafts[docId];
      const stringsWithMeta = await extractStringsWithMetadataForDoc(docId);

      for (const [source, metadata] of stringsWithMeta.entries()) {
        const hash = await sourceHash(source);
        let meta = arb.get(hash)?.meta;
        if (meta) {
          const contextIds = meta.context!.split(', ');
          contextIds.push(docId);
          contextIds.sort();
          meta.context = contextIds.join(', ');
          // Preserve existing description if it exists, otherwise use description from metadata
          if (!meta.description && metadata.description) {
            meta.description = metadata.description;
          }
        } else {
          meta = {
            context: docId,
          };
          if (metadata.notes) {
            meta.description = metadata.notes;
          }
        }
        arb.add(hash, source, meta);
      }
    }

    return arb;
  }

  async function onPreview() {
    try {
      const docIds = parseDocIds(docIdsText);
      const arb = await buildArbFile(docIds);
      setPreview(arb);
    } catch (err) {
      console.error(err);
      setError(`failed to preview arb: ${err}`);
    }
  }

  async function onDownloadArb() {
    try {
      setLoading(true);
      console.log('download arb');
      const docIds = parseDocIds(docIdsText);
      const arb = await buildArbFile(docIds);

      const arbContent = arb.toString();
      const res = new Response(arbContent);
      const blob = await res.blob();

      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = buildArbFilename(docIds);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(link.href);

      setLoading(false);
    } catch (err) {
      console.error(err);
      setError(`failed to download arb: ${err}`);
    }
  }

  return (
    <form
      className="TranslationsArbPage__RequestForm"
      onSubmit={(e) => {
        e.preventDefault();
        onDownloadArb();
      }}
    >
      <div className="TranslationsArbPage__RequestForm__textareaWrapper">
        <Textarea
          required={true}
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
      </div>
      <div className="TranslationsArbPage__RequestForm__submit">
        <Button variant="default" color="dark" size="xs" onClick={onPreview}>
          Preview
        </Button>
        <Button
          color="blue"
          size="xs"
          loading={loading}
          type="submit"
          leftIcon={<IconFileDownload size={16} strokeWidth={1.75} />}
        >
          Download ARB
        </Button>
      </div>
      {error && (
        <Text as="p" className="TranslationsArbPage__RequestForm__error">
          {error}
        </Text>
      )}
      {preview && <TranslationsArbPage.Preview arb={preview} />}
    </form>
  );
};

TranslationsArbPage.Preview = (props: {arb: Arb}) => {
  const values = props.arb.list().filter((item) => !!item.meta);
  console.log(values);
  return (
    <Table verticalSpacing="xs" highlightOnHover fontSize="xs">
      <thead>
        <tr>
          <th>source</th>
          <th>context</th>
        </tr>
      </thead>
      <tbody>
        {values.map((item) => (
          <tr
            key={item.source}
            class="TranslationsArbPage__Preview__Table__row"
          >
            <td>{item.source}</td>
            <td>
              {item.meta?.context}
              {item.meta?.description && <>/ {item.meta.description}</>}
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
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

/**
 * Builds a filename for the generated ARB file. The format is `<project>_<docId>_<timestamp>.arb`.
 */
function buildArbFilename(docIds: string[]) {
  // Format date as `YYYYMMDDtHHMM`.
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate()
  )}t${pad(now.getHours())}${pad(now.getMinutes())}`;
  const projectName =
    window.__ROOT_CTX.rootConfig.projectName ||
    window.__ROOT_CTX.rootConfig.projectId;
  const parts = [slugify(projectName)];
  if (docIds.length === 1) {
    parts.push(slugify(docIds[0]));
  }
  parts.push(timestamp);
  return `${parts.join('_')}.arb`;
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
