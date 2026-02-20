import {
  Button,
  LoadingOverlay,
  Select,
  TextInput,
  Textarea,
} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {useLocation} from 'preact-iso';
import {useEffect, useRef, useState} from 'preact/hooks';
import {isSlugValid} from '../../../shared/slug.js';
import {useGapiClient} from '../../hooks/useGapiClient.js';
import {
  DataSource,
  DataSourceType,
  GsheetDataFormat,
  HttpMethod,
  addDataSource,
  getDataSource,
  updateDataSource,
} from '../../utils/data-source.js';
import {parseSpreadsheetUrl} from '../../utils/gsheets.js';
import {notifyErrors} from '../../utils/notifications.js';
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
  const {route} = useLocation();
  const formRef = useRef<HTMLFormElement>(null);
  const gapiClient = useGapiClient();
  const [submitting, setSubmitting] = useState(false);
  const [dataSourceType, setDataSourceType] = useState<DataSourceType>(
    gapiClient.enabled ? 'gsheet' : 'http'
  );
  const [dataFormat, setDataFormat] = useState<GsheetDataFormat>('map');
  const [httpMethod, setHttpMethod] = useState<HttpMethod>('GET');
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
    await notifyErrors(async () => {
      const dataSource = await getDataSource(id);
      setDataSource(dataSource);
      setDataSourceType(dataSource?.type || 'http');
      setDataFormat(dataSource?.dataFormat || 'map');
    });
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

    const dataSourceId = props.dataSourceId || getValue('id');
    if (!dataSourceId) {
      setError('missing id');
      return;
    }
    if (!isSlugValid(dataSourceId)) {
      setError('id is invalid (alphanumeric characters and dashes only)');
      return;
    }

    const url = getValue('url');
    if (!url) {
      setError('missing url');
      return;
    }

    const dataSource: Partial<DataSource> = {
      id: dataSourceId,
      description: getValue('description'),
      type: dataSourceType,
      url: url,
      previewUrl: getValue('previewUrl'),
    };

    if (dataSourceType === 'http') {
      if (!testValidUrl(url)) {
        setError('invalid url');
        return;
      }

      dataSource.httpOptions = {
        method: httpMethod,
      };
      const httpHeadersInput = getValue('httpHeaders');
      if (httpHeadersInput) {
        dataSource.httpOptions.headers = parseHttpHeaders(httpHeadersInput);
      }
      if (httpMethod === 'POST') {
        const httpBody = getValue('httpBody');
        if (httpBody) {
          dataSource.httpOptions.body = httpBody;
        }
      }
    } else if (dataSourceType === 'gsheet') {
      const gsheetId = parseSpreadsheetUrl(url);
      if (!gsheetId?.spreadsheetId) {
        setError('failed to parse spreadsheet url');
        return;
      }

      dataSource.dataFormat = (dataFormat || 'map') as any;
    }

    try {
      setDataSource(dataSource as DataSource);
      setSubmitting(true);
      if (props.dataSourceId) {
        await updateDataSource(props.dataSourceId, dataSource);
        showNotification({
          title: 'Saved data source',
          message: `Successfully updated ${dataSourceId}`,
          autoClose: 5000,
        });
        setSubmitting(false);
      } else {
        await addDataSource(dataSourceId, dataSource);
        showNotification({
          title: 'Added data source',
          message: `Successfully added ${dataSourceId}`,
          autoClose: 5000,
        });
        setSubmitting(false);
        route(`/cms/data/${dataSourceId}`);
      }
    } catch (err) {
      console.error(err);
      showNotification({
        title: 'Failed to save data source',
        message: String(err),
        color: 'red',
        autoClose: false,
      });
      setSubmitting(false);
    }
  }

  // Only show the "gsheet" option if gapi is enabled.
  const typeSelectOptions = [{value: 'http', label: 'HTTP'}];
  if (gapiClient.enabled || dataSourceType === 'gsheet') {
    typeSelectOptions.push({value: 'gsheet', label: 'Google Sheet'});
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
          data={typeSelectOptions}
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
      {dataSourceType === 'http' && (
        <>
          <div className="DataSourceForm__input">
            <Select
              name="httpMethod"
              label="HTTP Request Method"
              data={[
                {value: 'GET', label: 'GET'},
                {value: 'POST', label: 'POST'},
              ]}
              value={httpMethod}
              onChange={(e: HttpMethod) => setHttpMethod(e)}
              size="xs"
              radius={0}
              // Due to issues with preact/compat, use a div for the dropdown el.
              dropdownComponent="div"
            />
          </div>
          <Textarea
            className="DataSourceForm__input"
            name="httpHeaders"
            label="HTTP Request Headers"
            description="Format as `HeaderName: Value`, each value on its own line."
            size="xs"
            radius={0}
            value={headersToString(dataSource?.httpOptions?.headers || {})}
          />
          {httpMethod === 'POST' && (
            <Textarea
              className="DataSourceForm__input"
              name="httpRequestBody"
              label="HTTP Request Body"
              size="xs"
              radius={0}
              value={dataSource?.httpOptions?.body}
            />
          )}
        </>
      )}
      {dataSourceType === 'gsheet' && (
        <div className="DataSourceForm__input">
          <Select
            name="dataFormat"
            label="Data Format"
            data={[
              // NOTE(stevenle): firestore doesn't support nested arrays.
              // {value: 'array', label: 'array'},
              {value: 'map', label: 'map'},
            ]}
            value={dataFormat}
            onChange={(e: GsheetDataFormat) => setDataFormat(e)}
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
      <TextInput
        className="DataSourceForm__input"
        name="previewUrl"
        label="Preview URL"
        description="URL where users can preview the data source."
        size="xs"
        radius={0}
        value={dataSource?.previewUrl}
      />
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

function parseHttpHeaders(text: string) {
  const headers: Record<string, string> = {};
  const lines = text.split('\n');
  lines.forEach((line) => {
    const index = line.indexOf(':');
    if (index === -1) {
      return;
    }

    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (key && value) {
      headers[key] = value;
    }
  });
  return headers;
}

function headersToString(headers: Record<string, string>) {
  const lines: string[] = [];
  for (const key in headers) {
    const val = headers[key];
    lines.push(`${key}: ${val}`);
  }
  return lines.join('\n');
}
