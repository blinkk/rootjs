import {
  Button,
  Checkbox,
  LoadingOverlay,
  NumberInput,
  Select,
  TextInput,
  Textarea,
} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {useEffect, useRef, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {isValidCronExpression} from '../../../core/cron-schedule.js';
import {isSlugValid} from '../../../shared/slug.js';
import {useGapiClient} from '../../hooks/useGapiClient.js';
import {
  CronScheduleType,
  CronUnit,
  DataSource,
  DataSourceCron,
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
  const [cronEnabled, setCronEnabled] = useState(false);
  const [cronSchedule, setCronSchedule] = useState<CronScheduleType>('interval');
  const [cronInterval, setCronInterval] = useState<number>(1);
  const [cronUnit, setCronUnit] = useState<CronUnit>('hours');
  const [cronDailyTime, setCronDailyTime] = useState('09:00');
  const [cronWeeklyDay, setCronWeeklyDay] = useState('1');
  const [cronWeeklyTime, setCronWeeklyTime] = useState('09:00');
  const [cronExpression, setCronExpression] = useState('');
  const [cronTimezone, setCronTimezone] = useState(getDefaultTimezone());
  const [cronAutoPublish, setCronAutoPublish] = useState(false);
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
      if (dataSource?.cron) {
        const cron = dataSource.cron;
        const schedule = cron.schedule || 'interval';
        setCronEnabled(cron.enabled || false);
        setCronSchedule(schedule);
        setCronInterval(cron.interval || 1);
        setCronUnit(cron.unit || 'hours');
        setCronTimezone(cron.timezone || getDefaultTimezone());
        if (schedule === 'daily') {
          setCronDailyTime(cronToTime(cron.expression));
        } else if (schedule === 'weekly') {
          setCronWeeklyTime(cronToTime(cron.expression));
          setCronWeeklyDay(cronToWeekday(cron.expression));
        } else if (schedule === 'custom') {
          setCronExpression(cron.expression || '');
        }
        setCronAutoPublish(cron.autoPublish || false);
      } else {
        setCronEnabled(false);
        setCronSchedule('interval');
        setCronInterval(1);
        setCronUnit('hours');
        setCronDailyTime('09:00');
        setCronWeeklyDay('1');
        setCronWeeklyTime('09:00');
        setCronExpression('');
        setCronTimezone(getDefaultTimezone());
        setCronAutoPublish(false);
      }
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

    const cron: DataSourceCron = {
      enabled: cronEnabled,
      schedule: cronSchedule,
      autoPublish: cronEnabled && cronAutoPublish,
    };
    if (cronSchedule === 'interval') {
      cron.interval = cronInterval;
      cron.unit = cronUnit;
    } else {
      let expression = '';
      if (cronSchedule === 'daily') {
        expression = buildDailyCron(cronDailyTime);
      } else if (cronSchedule === 'weekly') {
        expression = buildWeeklyCron(cronWeeklyTime, cronWeeklyDay);
      } else {
        expression = cronExpression.trim();
      }
      // Only validate the expression when the schedule is actually enabled, so
      // that disabling a partially-configured schedule can still be saved.
      if (cronEnabled && !isValidCronExpression(expression)) {
        setError(
          'invalid cron expression (expected 5 fields, e.g. "0 19 * * *")'
        );
        return;
      }
      cron.expression = expression;
      cron.timezone = cronTimezone;
    }
    dataSource.cron = cron;

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

      <div className="DataSourceForm__section">
        <div className="DataSourceForm__section__label">Sync Schedule</div>
        <Checkbox
          className="DataSourceForm__input"
          label="Enable scheduled sync"
          checked={cronEnabled}
          onChange={(e) => setCronEnabled(e.currentTarget.checked)}
          size="xs"
        />
        {cronEnabled && (
          <div className="DataSourceForm__cron">
            <div className="DataSourceForm__input">
              <Select
                label="Schedule"
                data={[
                  {value: 'interval', label: 'Interval'},
                  {value: 'daily', label: 'Daily'},
                  {value: 'weekly', label: 'Weekly'},
                  {value: 'custom', label: 'Custom (cron expression)'},
                ]}
                value={cronSchedule}
                onChange={(e: CronScheduleType) => setCronSchedule(e)}
                size="xs"
                radius={0}
                dropdownComponent="div"
              />
            </div>

            {cronSchedule === 'interval' && (
              <div className="DataSourceForm__cron__row">
                <span>Run every</span>
                <NumberInput
                  className="DataSourceForm__cron__interval"
                  value={cronInterval}
                  onChange={(val) => setCronInterval(Number(val) || 1)}
                  min={1}
                  size="xs"
                  radius={0}
                />
                <Select
                  className="DataSourceForm__cron__unit"
                  data={[
                    {value: 'minutes', label: 'minutes'},
                    {value: 'hours', label: 'hours'},
                    {value: 'days', label: 'days'},
                  ]}
                  value={cronUnit}
                  onChange={(e: CronUnit) => setCronUnit(e)}
                  size="xs"
                  radius={0}
                  dropdownComponent="div"
                />
              </div>
            )}

            {cronSchedule === 'daily' && (
              <div className="DataSourceForm__cron__row">
                <span>Run every day at</span>
                <input
                  type="time"
                  className="DataSourceForm__cron__time"
                  value={cronDailyTime}
                  onChange={(e) =>
                    setCronDailyTime((e.target as HTMLInputElement).value)
                  }
                />
              </div>
            )}

            {cronSchedule === 'weekly' && (
              <div className="DataSourceForm__cron__row">
                <span>Run every</span>
                <Select
                  className="DataSourceForm__cron__weekday"
                  data={WEEKDAYS}
                  value={cronWeeklyDay}
                  onChange={(val: string) => val && setCronWeeklyDay(val)}
                  size="xs"
                  radius={0}
                  dropdownComponent="div"
                />
                <span>at</span>
                <input
                  type="time"
                  className="DataSourceForm__cron__time"
                  value={cronWeeklyTime}
                  onChange={(e) =>
                    setCronWeeklyTime((e.target as HTMLInputElement).value)
                  }
                />
              </div>
            )}

            {cronSchedule === 'custom' && (
              <div className="DataSourceForm__input">
                <TextInput
                  label="Cron expression"
                  description='Standard 5-field cron, e.g. "0 19 * * *" runs every day at 7pm, "0 17 * * 5" runs every Friday at 5pm.'
                  placeholder="0 19 * * *"
                  value={cronExpression}
                  onChange={(e: any) =>
                    setCronExpression((e.target as HTMLInputElement).value)
                  }
                  size="xs"
                  radius={0}
                />
              </div>
            )}

            {cronSchedule !== 'interval' && (
              <div className="DataSourceForm__input">
                <Select
                  label="Timezone"
                  data={TIMEZONE_OPTIONS}
                  value={cronTimezone}
                  onChange={(val: string) => val && setCronTimezone(val)}
                  searchable
                  size="xs"
                  radius={0}
                  dropdownComponent="div"
                />
              </div>
            )}

            <Checkbox
              className="DataSourceForm__input"
              label="Auto-publish after sync"
              checked={cronAutoPublish}
              onChange={(e) => setCronAutoPublish(e.currentTarget.checked)}
              size="xs"
            />
          </div>
        )}
      </div>

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

const WEEKDAYS = [
  {value: '0', label: 'Sunday'},
  {value: '1', label: 'Monday'},
  {value: '2', label: 'Tuesday'},
  {value: '3', label: 'Wednesday'},
  {value: '4', label: 'Thursday'},
  {value: '5', label: 'Friday'},
  {value: '6', label: 'Saturday'},
];

const TIMEZONE_OPTIONS = getTimezoneOptions();

function getTimezoneOptions(): string[] {
  try {
    return (Intl as any).supportedValuesOf('timeZone');
  } catch (err) {
    return ['UTC'];
  }
}

function getDefaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (err) {
    return 'UTC';
  }
}

/** Parses a "HH:mm" time string into [hours, minutes], clamped to valid ranges. */
function parseTimeParts(time: string): [number, number] {
  const [hStr, mStr] = (time || '').split(':');
  const hours = clamp(parseInt(hStr, 10) || 0, 0, 23);
  const minutes = clamp(parseInt(mStr, 10) || 0, 0, 59);
  return [hours, minutes];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Builds a cron expression for a daily schedule, e.g. "0 19 * * *". */
function buildDailyCron(time: string): string {
  const [hours, minutes] = parseTimeParts(time);
  return `${minutes} ${hours} * * *`;
}

/** Builds a cron expression for a weekly schedule, e.g. "0 17 * * 5". */
function buildWeeklyCron(time: string, dayOfWeek: string): string {
  const [hours, minutes] = parseTimeParts(time);
  return `${minutes} ${hours} * * ${dayOfWeek}`;
}

/** Extracts a "HH:mm" time string from a cron expression's minute/hour fields. */
function cronToTime(expression?: string): string {
  const fields = (expression || '').trim().split(/\s+/);
  if (fields.length < 2) {
    return '09:00';
  }
  const minutes = pad2(parseInt(fields[0], 10) || 0);
  const hours = pad2(parseInt(fields[1], 10) || 0);
  return `${hours}:${minutes}`;
}

/** Extracts the day-of-week field (0-6) from a cron expression. */
function cronToWeekday(expression?: string): string {
  const fields = (expression || '').trim().split(/\s+/);
  const dayOfWeek = fields[4];
  // Normalize Sunday (7) to 0 for the select options.
  if (dayOfWeek === '7') {
    return '0';
  }
  return dayOfWeek && /^[0-6]$/.test(dayOfWeek) ? dayOfWeek : '1';
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}
