import {IconFileDiff, IconJson} from '@tabler/icons-preact';
import {useState} from 'preact/hooks';
import {defineGallery} from '../../dev/gallery/types.js';
import {Tab, TabList, TabPanel, Tabs} from './Tabs.js';

const LOCALES = [
  'English',
  'French',
  'German',
  'Japanese',
  'Korean',
  'Portuguese (Brazil)',
  'Spanish (Latin America)',
];

function ControlledTabs() {
  const [tab, setTab] = useState('overview');
  return (
    <div className="flex flex-col gap-2">
      <Tabs value={tab} onChange={setTab}>
        <TabList aria-label="Release views">
          <Tab value="overview">Overview</Tab>
          <Tab value="changes" count={12}>
            Changes
          </Tab>
          <Tab value="history" disabled>
            History
          </Tab>
        </TabList>
        <TabPanel value="overview" className="text-sm">
          The release overview.
        </TabPanel>
        <TabPanel value="changes" className="text-sm">
          Twelve changed documents.
        </TabPanel>
        <TabPanel value="history" className="text-sm">
          Publish history.
        </TabPanel>
      </Tabs>
      <span className="text-sm text-muted">Selected: {tab}</span>
    </div>
  );
}

export const TabsGallery = defineGallery({
  id: 'tabs',
  name: 'Tabs',
  group: 'Primitives',
  stories: {
    Default: () => (
      <Tabs defaultValue="json">
        <TabList aria-label="Editor views">
          <Tab value="json" icon={<IconJson />}>
            JSON
          </Tab>
          <Tab value="diff" icon={<IconFileDiff />}>
            Diff
          </Tab>
        </TabList>
        <TabPanel value="json" className="text-sm">
          The JSON editor.
        </TabPanel>
        <TabPanel value="diff" className="text-sm">
          The diff viewer.
        </TabPanel>
      </Tabs>
    ),
    'Grow to full width': () => (
      <Tabs defaultValue="json" grow>
        <TabList aria-label="Editor views">
          <Tab value="json" icon={<IconJson />}>
            JSON
          </Tab>
          <Tab value="diff" icon={<IconFileDiff />}>
            Diff
          </Tab>
        </TabList>
        <TabPanel value="json" className="text-sm">
          The JSON editor.
        </TabPanel>
        <TabPanel value="diff" className="text-sm">
          The diff viewer.
        </TabPanel>
      </Tabs>
    ),
    'Controlled, with a count and a disabled tab': () => <ControlledTabs />,
    'Scrolls when narrow': () => (
      <Tabs defaultValue="English">
        <TabList aria-label="Locales">
          {LOCALES.map((locale) => (
            <Tab key={locale} value={locale}>
              {locale}
            </Tab>
          ))}
        </TabList>
        {LOCALES.map((locale) => (
          <TabPanel key={locale} value={locale} className="text-sm">
            Translations for {locale}.
          </TabPanel>
        ))}
      </Tabs>
    ),
  },
});
