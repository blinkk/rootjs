import {ComponentChildren} from 'preact';
import {useRef, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {isValidCronExpression} from '../../../../../core/cron-schedule.js';
import {isSlugValid} from '../../../../../shared/slug.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {Text} from '../../../../components/Text/Text.js';
import {parseSpreadsheetUrl} from '../../../../integrations/gsheets.js';
import {useGapiClient} from '../../../../integrations/useGapiClient.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Checkbox} from '../../../../primitives/Checkbox/Checkbox.js';
import {Field, fieldLabelId} from '../../../../primitives/Field/Field.js';
import {NumberInput} from '../../../../primitives/NumberInput/NumberInput.js';
import {SegmentedControl} from '../../../../primitives/SegmentedControl/SegmentedControl.js';
import {Select} from '../../../../primitives/Select/Select.js';
import {Switch} from '../../../../primitives/Switch/Switch.js';
import {Textarea} from '../../../../primitives/Textarea/Textarea.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {showNotification} from '../../../../primitives/Toast/toastStore.js';
import {cn} from '../../../../utils/classes.js';
import {
  CronScheduleType,
  CronUnit,
  DataSource,
  DataSourceCron,
  DataSourceType,
  GsheetDataFormat,
  HttpMethod,
  addDataSource,
  updateDataSource,
} from '../../data-source.js';
import {DataSourceIcon} from '../DataSourceIcon/DataSourceIcon.js';

const HTTP_URL_HELP = 'The URL to request when the data source syncs.';
const GSHEET_URL_HELP =
  'Open the tab you want to sync and copy its URL from the address bar.';

const SCHEDULE_OPTIONS: Array<{value: CronScheduleType; label: string}> = [
  {value: 'interval', label: 'Interval'},
  {value: 'daily', label: 'Daily'},
  {value: 'weekly', label: 'Weekly'},
  {value: 'custom', label: 'Custom'},
];

export interface DataSourceFormProps {
  className?: string;
  /** The data source to edit. Omit to create a new one. */
  dataSource?: DataSource | null;
}

/**
 * The form for creating or editing a data source, as a column of section
 * cards with a sticky footer holding the cancel and submit buttons.
 */
export function DataSourceForm(props: DataSourceFormProps) {
  const {route} = useLocation();
  const formRef = useRef<HTMLFormElement>(null);
  const gapiClient = useGapiClient();
  // The form's initial values. Text fields are uncontrolled (their values are
  // read from the form on submit), so re-renders don't reset what's typed.
  const initial = props.dataSource;
  const isEdit = Boolean(initial);
  const cron = initial?.cron;
  const schedule = cron?.schedule || 'interval';
  const [submitting, setSubmitting] = useState(false);
  const [dataSourceType, setDataSourceType] = useState<DataSourceType>(
    initial?.type || (gapiClient.enabled ? 'gsheet' : 'http')
  );
  const [dataFormat, setDataFormat] = useState<GsheetDataFormat>(
    initial?.dataFormat || 'map'
  );
  const [httpMethod, setHttpMethod] = useState<HttpMethod>(
    initial?.httpOptions?.method || 'GET'
  );
  const [cronEnabled, setCronEnabled] = useState(cron?.enabled || false);
  const [cronSchedule, setCronSchedule] = useState<CronScheduleType>(schedule);
  const [cronInterval, setCronInterval] = useState<number>(cron?.interval || 1);
  const [cronUnit, setCronUnit] = useState<CronUnit>(cron?.unit || 'hours');
  const [cronDailyTime, setCronDailyTime] = useState(
    schedule === 'daily' ? cronToTime(cron?.expression) : '09:00'
  );
  const [cronWeeklyDay, setCronWeeklyDay] = useState(
    schedule === 'weekly' ? cronToWeekday(cron?.expression) : '1'
  );
  const [cronWeeklyTime, setCronWeeklyTime] = useState(
    schedule === 'weekly' ? cronToTime(cron?.expression) : '09:00'
  );
  const [cronExpression, setCronExpression] = useState(
    schedule === 'custom' ? cron?.expression || '' : ''
  );
  const [cronTimezone, setCronTimezone] = useState(
    cron?.timezone || getDefaultTimezone()
  );
  const [cronAutoPublish, setCronAutoPublish] = useState(
    cron?.autoPublish || false
  );
  const [error, setError] = useState('');

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

    const dataSourceId = initial?.id || getValue('id');
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
        const httpBody = getValue('httpRequestBody');
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

      dataSource.dataFormat = dataFormat || 'map';
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
      let expression: string;
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
      setSubmitting(true);
      if (isEdit) {
        await updateDataSource(dataSourceId, dataSource);
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
  const showGsheet = gapiClient.enabled || dataSourceType === 'gsheet';

  return (
    <form
      className={cn('DataSourceForm flex flex-col gap-4', props.className)}
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <DataSourceForm.Section title="Details">
        <TextInput
          className="DataSourceForm__id"
          classNames={{input: 'font-mono'}}
          name="id"
          label="ID"
          description={
            isEdit
              ? 'IDs can’t be changed because code references them.'
              : 'Used to reference the data source in code. Letters, numbers, and dashes only, e.g. homepage-promos. Can’t be changed later.'
          }
          defaultValue={initial?.id}
          disabled={isEdit}
        />
        <Textarea
          className="DataSourceForm__description"
          name="description"
          label="Description (optional)"
          defaultValue={initial?.description}
        />
        <TextInput
          className="DataSourceForm__previewUrl"
          name="previewUrl"
          label="Preview URL (optional)"
          description="A page where editors can see the synced data before publishing."
          placeholder="/preview/home"
          defaultValue={initial?.previewUrl}
        />
      </DataSourceForm.Section>

      <DataSourceForm.Section
        title="Source"
        description="Where the data is fetched from when the data source syncs."
      >
        <DataSourceForm.Choices label="Type">
          {showGsheet && (
            <DataSourceForm.Choice
              name="type"
              checked={dataSourceType === 'gsheet'}
              onSelect={() => setDataSourceType('gsheet')}
              icon={<DataSourceIcon type="gsheet" size={32} />}
              title="Google Sheet"
              description="Sync the rows of a spreadsheet tab."
            />
          )}
          <DataSourceForm.Choice
            name="type"
            checked={dataSourceType === 'http'}
            onSelect={() => setDataSourceType('http')}
            icon={<DataSourceIcon type="http" size={32} />}
            title="HTTP"
            description="Fetch JSON or text from a URL."
          />
        </DataSourceForm.Choices>
        <Field
          className="DataSourceForm__url"
          label={dataSourceType === 'gsheet' ? 'Spreadsheet URL' : 'URL'}
          description={
            dataSourceType === 'gsheet' ? GSHEET_URL_HELP : HTTP_URL_HELP
          }
        >
          {(control) => (
            <div className="flex items-center gap-2">
              {dataSourceType === 'http' && (
                <SegmentedControl
                  className="DataSourceForm__httpMethod shrink-0"
                  aria-label="Request method"
                  data={['GET', 'POST'] as HttpMethod[]}
                  value={httpMethod}
                  onValueChange={setHttpMethod}
                  size="xs"
                />
              )}
              <TextInput
                {...control}
                className="min-w-0 grow"
                name="url"
                type="url"
                defaultValue={initial?.url}
              />
            </div>
          )}
        </Field>
        {dataSourceType === 'http' && (
          <>
            <Textarea
              className="DataSourceForm__httpHeaders"
              classNames={{input: 'font-mono'}}
              name="httpHeaders"
              label="Headers (optional)"
              description="One per line, as “Name: value”."
              defaultValue={headersToString(
                initial?.httpOptions?.headers || {}
              )}
            />
            {httpMethod === 'POST' && (
              <Textarea
                className="DataSourceForm__httpBody"
                classNames={{input: 'font-mono'}}
                name="httpRequestBody"
                label="Body"
                defaultValue={initial?.httpOptions?.body}
              />
            )}
          </>
        )}
        {dataSourceType === 'gsheet' && (
          <DataSourceForm.Choices label="Data format">
            <DataSourceForm.Choice
              name="dataFormat"
              checked={dataFormat === 'map'}
              onSelect={() => setDataFormat('map')}
              title="Rows as objects"
              tag="map"
              description="Each row is keyed by the header row."
              example='[{"header1": "foo", "header2": "bar"}]'
            />
            <DataSourceForm.Choice
              name="dataFormat"
              checked={dataFormat === 'grid'}
              onSelect={() => setDataFormat('grid')}
              title="Rows as arrays"
              tag="grid"
              description="Mirrors the sheet, header row included."
              example='[["header1", "header2"], ["foo", "bar"]]'
            />
          </DataSourceForm.Choices>
        )}
      </DataSourceForm.Section>

      <DataSourceForm.Section
        title="Scheduled sync"
        description="Sync automatically instead of only when someone clicks Sync."
        action={
          <Switch
            className="DataSourceForm__cronEnabled"
            aria-label="Scheduled sync"
            checked={cronEnabled}
            onChange={(e) => setCronEnabled(e.currentTarget.checked)}
            size="md"
          />
        }
      >
        {cronEnabled && (
          <>
            <SegmentedControl
              className="DataSourceForm__cronSchedule self-start"
              label="Frequency"
              data={SCHEDULE_OPTIONS}
              value={cronSchedule}
              onValueChange={setCronSchedule}
              size="xs"
            />

            {cronSchedule === 'interval' && (
              <DataSourceForm.Sentence>
                <span>Every</span>
                <NumberInput
                  className="DataSourceForm__cronInterval w-20"
                  aria-label="Interval"
                  value={cronInterval}
                  onValueChange={(val) => setCronInterval(Number(val) || 1)}
                  min={1}
                  size="sm"
                />
                <Select
                  className="DataSourceForm__cronUnit w-30"
                  aria-label="Interval unit"
                  data={[
                    {value: 'minutes', label: 'minutes'},
                    {value: 'hours', label: 'hours'},
                    {value: 'days', label: 'days'},
                  ]}
                  value={cronUnit}
                  onValueChange={(e) => setCronUnit(e as CronUnit)}
                  size="sm"
                />
              </DataSourceForm.Sentence>
            )}

            {cronSchedule === 'daily' && (
              <DataSourceForm.Sentence>
                <span>Every day at</span>
                <DataSourceForm.TimeInput
                  value={cronDailyTime}
                  onChange={setCronDailyTime}
                />
                <DataSourceForm.Timezone
                  value={cronTimezone}
                  onChange={setCronTimezone}
                />
              </DataSourceForm.Sentence>
            )}

            {cronSchedule === 'weekly' && (
              <DataSourceForm.Sentence>
                <span>Every</span>
                <Select
                  className="DataSourceForm__cronWeekday w-35"
                  aria-label="Day of week"
                  data={WEEKDAYS}
                  value={cronWeeklyDay}
                  onValueChange={(val) => val && setCronWeeklyDay(val)}
                  size="sm"
                />
                <span>at</span>
                <DataSourceForm.TimeInput
                  value={cronWeeklyTime}
                  onChange={setCronWeeklyTime}
                />
                <DataSourceForm.Timezone
                  value={cronTimezone}
                  onChange={setCronTimezone}
                />
              </DataSourceForm.Sentence>
            )}

            {cronSchedule === 'custom' && (
              <>
                <TextInput
                  className="DataSourceForm__cronExpression"
                  classNames={{input: 'font-mono'}}
                  label="Cron expression"
                  description='Standard 5-field cron, e.g. "0 19 * * *" runs every day at 7 PM, "0 17 * * 5" runs every Friday at 5 PM.'
                  placeholder="0 19 * * *"
                  value={cronExpression}
                  onChange={(e: any) =>
                    setCronExpression((e.target as HTMLInputElement).value)
                  }
                />
                <DataSourceForm.Sentence>
                  <DataSourceForm.Timezone
                    value={cronTimezone}
                    onChange={setCronTimezone}
                  />
                </DataSourceForm.Sentence>
              </>
            )}

            <Checkbox
              className="DataSourceForm__cronAutoPublish"
              label="Publish after each sync"
              description="Synced data goes live without a review step."
              checked={cronAutoPublish}
              onChange={(e) => setCronAutoPublish(e.currentTarget.checked)}
            />
          </>
        )}
      </DataSourceForm.Section>

      <div className="DataSourceForm__footer sticky bottom-0 z-(--cms-z-sticky) flex flex-wrap items-center justify-end gap-2 border-0 border-t border-solid border-border bg-page py-3">
        {error && (
          <div
            className="DataSourceForm__error mr-auto text-sm font-medium text-danger"
            role="alert"
          >
            Error: {error}
          </div>
        )}
        <Button href={isEdit ? `/cms/data/${initial!.id}` : '/cms/data'}>
          Cancel
        </Button>
        <Button variant="blue" type="submit" loading={submitting}>
          {isEdit ? 'Save changes' : 'Create data source'}
        </Button>
      </div>
    </form>
  );
}

/** A card holding one group of the form's fields. */
DataSourceForm.Section = (props: {
  title: string;
  description?: string;
  /** A control beside the title, e.g. a switch that enables the section. */
  action?: ComponentChildren;
  children?: ComponentChildren;
}) => {
  const children = Array.isArray(props.children)
    ? props.children.filter(Boolean)
    : props.children;
  const hasChildren = Array.isArray(children)
    ? children.length > 0
    : !!children;
  return (
    <section className="DataSourceForm__section rounded-xl border border-solid border-border bg-surface p-4 shadow-sm md:px-6 md:py-5">
      <div className="DataSourceForm__section__header flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Heading size="h3" weight="semi-bold">
            {props.title}
          </Heading>
          {props.description && (
            <Text as="p" size="body-sm" color="gray" className="mb-0 mt-1">
              {props.description}
            </Text>
          )}
        </div>
        {props.action}
      </div>
      {hasChildren && (
        <div className="DataSourceForm__section__fields mt-5 flex flex-col gap-4">
          {children}
        </div>
      )}
    </section>
  );
};

/** A labeled group of `DataSourceForm.Choice` radio cards. */
DataSourceForm.Choices = (props: {
  label: string;
  children: ComponentChildren;
}) => {
  return (
    <Field label={props.label} labelAs="div">
      {(control) => (
        <div
          className="DataSourceForm__choices grid gap-2.5 sm:grid-cols-2"
          role="radiogroup"
          aria-labelledby={fieldLabelId(control.id)}
        >
          {props.children}
        </div>
      )}
    </Field>
  );
};

/** A radio option shown as a card, with a title, description, and example. */
DataSourceForm.Choice = (props: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  icon?: ComponentChildren;
  title: string;
  /** A short code label shown beside the title. */
  tag?: string;
  description: string;
  /** A code sample shown beneath the description. */
  example?: string;
}) => {
  return (
    <label
      className={cn(
        'DataSourceForm__choice',
        props.checked && 'DataSourceForm__choice--selected',
        'flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border border-solid p-3.5 transition-colors',
        'has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-focus',
        props.checked
          ? 'border-info bg-info-soft'
          : 'border-border bg-surface hover:bg-surface-hover'
      )}
    >
      <input
        className="sr-only"
        type="radio"
        name={props.name}
        checked={props.checked}
        onChange={() => props.onSelect()}
      />
      {props.icon}
      <span className="min-w-0 grow">
        <span className="block text-sm font-semibold text-fg">
          {props.title}
          {props.tag && (
            <span className="ml-1.5 font-mono text-xs font-normal text-muted">
              {props.tag}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-sm text-muted">
          {props.description}
        </span>
        {props.example && (
          <code className="mt-2 block truncate rounded-sm bg-chip px-2 py-1.5 font-mono text-xs text-fg">
            {props.example}
          </code>
        )}
      </span>
    </label>
  );
};

/** A row of inline controls that reads as a sentence, e.g. "Every 6 hours". */
DataSourceForm.Sentence = (props: {children: ComponentChildren}) => {
  return (
    <div className="DataSourceForm__sentence flex flex-wrap items-center gap-2 text-sm">
      {props.children}
    </div>
  );
};

DataSourceForm.TimeInput = (props: {
  value: string;
  onChange: (value: string) => void;
}) => {
  return (
    <TextInput
      className="DataSourceForm__cronTime w-28"
      type="time"
      aria-label="Time"
      value={props.value}
      onChange={(e) => props.onChange((e.target as HTMLInputElement).value)}
      size="sm"
    />
  );
};

DataSourceForm.Timezone = (props: {
  value: string;
  onChange: (value: string) => void;
}) => {
  return (
    <>
      <span>in</span>
      <Select
        className="DataSourceForm__cronTimezone w-56"
        aria-label="Timezone"
        data={TIMEZONE_OPTIONS}
        value={props.value}
        onValueChange={(val) => val && props.onChange(val)}
        searchable
        size="sm"
      />
    </>
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
  } catch {
    return ['UTC'];
  }
}

function getDefaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
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
