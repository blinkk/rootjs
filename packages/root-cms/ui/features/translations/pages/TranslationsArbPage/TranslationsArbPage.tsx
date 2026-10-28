import {IconFileDownload} from '@tabler/icons-preact';
import {ChangeEvent, useState} from 'preact/compat';
import {Layout} from '../../../../app/layout/Layout.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {Text} from '../../../../components/Text/Text.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {Breadcrumbs} from '../../../../primitives/Breadcrumbs/Breadcrumbs.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../../../primitives/Table/Table.js';
import {Textarea} from '../../../../primitives/Textarea/Textarea.js';
import {getDraftDocs} from '../../../documents/doc.js';
import {Arb} from '../../arb.js';
import {extractStringsWithMetadataForDoc} from '../../extract.js';
import {sourceHash} from '../../l10n.js';

export function TranslationsArbPage() {
  usePageTitle('ARB Translations');
  return (
    <Layout>
      <div className="TranslationsArbPage px-4 pb-4 pt-6 md:p-15 md:pt-12">
        <div className="TranslationsArbPage__header max-w-150">
          <Breadcrumbs
            className="TranslationsArbPage__headerBreadcrumbs mb-3"
            items={[
              {label: 'Translations', href: '/cms/translations'},
              {label: 'ARB'},
            ]}
          />
          <Heading size="h1">ARB Translations</Heading>
          <Text as="p" className="mt-1">
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
      className="TranslationsArbPage__requestForm mt-5 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onDownloadArb();
      }}
    >
      <div className="TranslationsArbPage__requestFormTextareaWrapper max-w-150">
        <Textarea
          required={true}
          aria-label="Doc ids"
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
      <div className="TranslationsArbPage__requestFormSubmit sticky -top-6 z-(--cms-z-sticky) flex flex-row flex-wrap gap-2.5 bg-surface py-2 md:-top-12">
        <Button onClick={onPreview}>Preview</Button>
        <Button
          variant="primary"
          loading={loading}
          type="submit"
          icon={<IconFileDownload size={16} strokeWidth={1.75} />}
        >
          Download ARB
        </Button>
      </div>
      {error && (
        <Text
          as="p"
          className="TranslationsArbPage__requestFormError text-danger"
        >
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
    <Table
      dense
      hover
      label="ARB preview"
      className="TranslationsArbPage__preview"
    >
      <TableHead>
        <TableRow>
          <TableHeaderCell>source</TableHeaderCell>
          <TableHeaderCell>context</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {values.map((item) => (
          <TableRow
            key={item.source}
            className="TranslationsArbPage__previewTableRow"
          >
            <TableCell>{item.source}</TableCell>
            <TableCell>
              {item.meta?.context}
              {item.meta?.description && <>/ {item.meta.description}</>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
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
