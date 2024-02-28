import {Breadcrumbs, Button, Select, TextInput, Textarea} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {useRef, useState} from 'preact/hooks';
import {route} from 'preact-router';
import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {Layout} from '../../layout/Layout.js';
import './DataNewPage.css';
import {
  DataSource,
  DataSourceType,
  addDataSource,
} from '../../utils/data-source.js';
import {parseSpreadsheetUrl} from '../../utils/gsheets.js';
import {isSlugValid} from '../../utils/slug.js';

const HTTP_URL_HELP = 'Enter the URL to make the HTTP request.';
const GSHEET_URL_HELP =
  'Enter the URL of the Google Sheet, e.g. https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit#gid=SHEET_ID';

export function DataNewPage() {
  return (
    <Layout>
      <div className="DataNewPage">
        <div className="DataNewPage__header">
          <Breadcrumbs className="DataNewPage__header__breadcrumbs">
            <a href="/cms/data">Data Sources</a>
            <div>New</div>
          </Breadcrumbs>
          <Heading size="h1">Add data source</Heading>
        </div>
        <DataNewPage.Form />
      </div>
    </Layout>
  );
}

DataNewPage.Form = () => {
  const formRef = useRef<HTMLFormElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dataSourceType, setDataSourceType] =
    useState<DataSourceType>('gsheet');
  const [dataFormat, setDataFormat] = useState('map');
  const [error, setError] = useState('');

  let urlHelp = '';
  if (dataSourceType === 'http') {
    urlHelp = HTTP_URL_HELP;
  } else if (dataSourceType === 'gsheet') {
    urlHelp = GSHEET_URL_HELP;
  }

  async function onSubmit() {
    setError('');
    const form = formRef.current!;

    function getValue(name: string) {
      const inputEl = form.elements[name as any] as HTMLInputElement;
      if (inputEl) {
        return inputEl.value.trim();
      }
      return '';
    }

    const id = getValue('id');
    if (!id) {
      setError('missing id');
      return;
    }
    if (!isSlugValid(id)) {
      setError('id is invalid (alphanumeric characters and dashes only)');
      return;
    }

    const url = getValue('url');
    if (!url) {
      setError('missing url');
      return;
    }

    if (dataSourceType === 'http') {
      if (!testValidUrl(url)) {
        setError('invalid url');
        return;
      }
    } else if (dataSourceType === 'gsheet') {
      const gsheetId = parseSpreadsheetUrl(url);
      if (!gsheetId?.spreadsheetId) {
        setError('failed to parse spreadsheet url');
        return;
      }
    }

    try {
      setSubmitting(true);
      const dataSource: DataSource = {
        id: id,
        description: getValue('description'),
        type: dataSourceType,
        url: url,
      };
      if (dataSourceType === 'gsheet') {
        dataSource.dataFormat = (dataFormat || 'map') as any;
      }
      await addDataSource(dataSource);
      showNotification({
        title: 'Added data source',
        message: `Successfully added ${id}`,
        autoClose: 5000,
      });
      setSubmitting(false);
      // route(`/cms/data/${id}`);
      route('/cms/data/');
    } catch (err) {
      console.error(err);
      setSubmitting(false);
    }
  }

  return (
    <form
      className="DataNewPage__form"
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="DataNewPage__form__input">
        <Select
          name="type"
          label="Type"
          data={[
            // TODO(stevenle): support http urls.
            // {value: 'http', label: 'HTTP'},
            {value: 'gsheet', label: 'Google Sheet'},
          ]}
          value={dataSourceType}
          onChange={(e: DataSourceType) => setDataSourceType(e)}
          size="xs"
          radius={0}
          // Due to issues with preact/compat, use a div for the dropdown el.
          dropdownComponent="div"
        />
      </div>
      <TextInput
        className="DataNewPage__form__input"
        name="id"
        label="ID"
        description="Unique identifier for the data source. Use alphanumeric characters and dashes only, e.g. grogus-favorite-meals"
        size="xs"
        radius={0}
      />
      <Textarea
        className="DataNewPage__form__input"
        name="description"
        label="Description"
        description="Optional."
        size="xs"
        radius={0}
      />
      <TextInput
        className="DataNewPage__form__input"
        name="url"
        label="URL"
        description={urlHelp}
        size="xs"
        radius={0}
      />
      {dataSourceType === 'gsheet' && (
        <div className="DataNewPage__form__input">
          <Select
            name="type"
            label="Type"
            data={[
              {value: 'array', label: 'array'},
              {value: 'map', label: 'map'},
            ]}
            value={dataFormat}
            onChange={(e: string) => setDataFormat(e)}
            size="xs"
            radius={0}
            // Due to issues with preact/compat, use a div for the dropdown el.
            dropdownComponent="div"
          />
          {dataFormat === 'array' && (
            <div className="DataNewPage__form__input__example">
              Data is stored as an array of arrays, e.g.
              <code>[[header1, header2], [foo, bar]]</code>
            </div>
          )}
          {dataFormat === 'map' && (
            <div className="DataNewPage__form__input__example">
              Data is stored as an array of maps, e.g.
              <code>
                [{'{'}header1: foo, header2: bar{'}'}]
              </code>
            </div>
          )}
        </div>
      )}
      <Button
        className="DataNewPage__form__submit"
        color="blue"
        size="xs"
        type="submit"
        loading={submitting}
      >
        Add data source
      </Button>
      {error && <div className="DataNewPage__form__error">Error: {error}</div>}
    </form>
  );
};

function testValidUrl(str: string) {
  let url;
  const host = str.startsWith('/') ? 'http://localhost' : undefined;
  try {
    url = new URL(str, host);
  } catch (err) {
    console.error(err);
    return false;
  }
  return url.protocol === 'http:' || url.protocol === 'https:';
}
