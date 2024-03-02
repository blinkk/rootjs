import {
  Button,
  LoadingOverlay,
  Select,
  TextInput,
  Textarea,
} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {useEffect, useRef, useState} from 'preact/hooks';
import {route} from 'preact-router';
import {
  DataSource,
  DataSourceType,
  addDataSource,
  getDataSource,
  updateDataSource,
} from '../../utils/data-source.js';
import {parseSpreadsheetUrl} from '../../utils/gsheets.js';
import {isSlugValid} from '../../utils/slug.js';
import './DataSourceForm.css';

const HTTP_URL_HELP = 'Enter the URL to make the HTTP request.';
const GSHEET_URL_HELP =
  'Enter the URL of the Google Sheet, e.g. https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit#gid=SHEET_ID';

export interface DataSourceFormProps {
  className?: string;
  dataSourceId?: string;
  buttonLabel?: string;
}

export function DataSourceForm(props: DataSourceFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dataSourceType, setDataSourceType] =
    useState<DataSourceType>('gsheet');
  const [dataFormat, setDataFormat] = useState('map');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!!props.dataSourceId);
  const [dataSource, setDataSource] = useState<DataSource | null>(null);

  let urlHelp = '';
  if (dataSourceType === 'http') {
    urlHelp = HTTP_URL_HELP;
  } else if (dataSourceType === 'gsheet') {
    urlHelp = GSHEET_URL_HELP;
  }

  async function fetchDataSource(id: string) {
    const dataSource = await getDataSource(id);
    setDataSource(dataSource);
    setDataFormat(dataSource?.dataFormat || 'map');
    setLoading(false);
  }

  useEffect(() => {
    if (!props.dataSourceId) {
      return;
    }
    setLoading(true);
    fetchDataSource(props.dataSourceId);
  }, [props.dataSourceId]);

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

    const id = props.dataSourceId || getValue('id');
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
      if (props.dataSourceId) {
        await updateDataSource(props.dataSourceId, dataSource);
        showNotification({
          title: 'Saved data source',
          message: `Successfully updated ${id}`,
          autoClose: 5000,
        });
        setSubmitting(false);
      } else {
        await addDataSource(dataSource);
        showNotification({
          title: 'Added data source',
          message: `Successfully added ${id}`,
          autoClose: 5000,
        });
        setSubmitting(false);
        route(`/cms/data/${id}`);
      }
    } catch (err) {
      console.error(err);
      setSubmitting(false);
    }
  }

  return (
    <form
      className="DataSourceForm"
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <LoadingOverlay visible={loading} />
      <div className="DataSourceForm__input">
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
        className="DataSourceForm__input"
        name="id"
        label="ID"
        description="Unique identifier for the data source. Use alphanumeric characters and dashes only, e.g. grogus-favorite-meals"
        size="xs"
        radius={0}
        value={props.dataSourceId}
        disabled={!!props.dataSourceId}
      />
      <Textarea
        className="DataSourceForm__input"
        name="description"
        label="Description"
        description="Optional."
        size="xs"
        radius={0}
        value={dataSource?.description}
      />
      <TextInput
        className="DataSourceForm__input"
        name="url"
        label="URL"
        description={urlHelp}
        size="xs"
        radius={0}
        value={dataSource?.url}
      />
      {dataSourceType === 'gsheet' && (
        <div className="DataSourceForm__input">
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
            <div className="DataSourceForm__input__example">
              Data is stored as an array of arrays, e.g.
              <code>[[header1, header2], [foo, bar]]</code>
            </div>
          )}
          {dataFormat === 'map' && (
            <div className="DataSourceForm__input__example">
              Data is stored as an array of maps, e.g.
              <code>
                [{'{'}header1: foo, header2: bar{'}'}]
              </code>
            </div>
          )}
        </div>
      )}
      <Button
        className="DataSourceForm__submit"
        color="blue"
        size="xs"
        type="submit"
        loading={submitting}
      >
        {props.buttonLabel || 'Save'}
      </Button>
      {error && <div className="DataSourceForm__error">Error: {error}</div>}
    </form>
  );
}

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
