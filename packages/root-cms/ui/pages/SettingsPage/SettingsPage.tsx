import './SettingsPage.css';
import {Switch, Textarea} from '@mantine/core';
import {Heading} from '../../components/Heading/Heading.js';
import {ShareBox} from '../../components/ShareBox/ShareBox.js';
import {Text} from '../../components/Text/Text.js';
import {SITE_SETTINGS, useSiteSettings} from '../../hooks/useSiteSettings.js';
import {useUserPreferences} from '../../hooks/useUserPreferences.js';
import {Layout} from '../../layout/Layout.js';

export function SettingsPage() {
  const userPrefs = useUserPreferences();
  const siteSettings = useSiteSettings();
  return (
    <Layout>
      <div className="SettingsPage">
        <div className="SettingsPage__section SettingsPage__section__users">
          <div className="SettingsPage__section__left">
            <Heading className="SettingsPage__section__left__title">
              Share
            </Heading>
            <Text
              className="SettingsPage__section__body"
              size="body-sm"
              weight="semi-bold"
              color="gray"
            >
              <p>
                Share access to the CMS. To share with everyone in a domain, use
                *@example.com.
              </p>
              <ul>
                <li>VIEWER: view docs but not edit</li>
                <li>EDITOR: view and edit docs</li>
                <li>ADMIN: all of the above and change sharing settings</li>
              </ul>
            </Text>
          </div>
          <div className="SettingsPage__section__right">
            <Heading className="SettingsPage__section__right__title" size="h3">
              Users
            </Heading>
            <ShareBox className="SettingsPage__section__users__sharebox" />
          </div>
        </div>
        <div className="SettingsPage__section">
          <div className="SettingsPage__section__left">
            <Heading className="SettingsPage__section__left__title">
              Site Settings
            </Heading>
            <Text
              className="SettingsPage__section__body"
              size="body-sm"
              weight="semi-bold"
              color="gray"
            >
              <p>
                These settings apply to the project. Only admins can change
                them.
              </p>
            </Text>
          </div>
          <div className="SettingsPage__section__right">
            {SITE_SETTINGS.map((setting) => (
              <div className="SettingsPage__section__setting" key={setting.key}>
                <Text size="body" weight="semi-bold">
                  {setting.name}
                </Text>
                <Text size="body-sm" weight="semi-bold" color="gray">
                  <p>{setting.description}</p>
                </Text>
                <Textarea
                  autosize
                  minRows={2}
                  maxRows={4}
                  value={siteSettings.settings[setting.key] || ''}
                  placeholder={setting.placeholder}
                  onChange={(e: Event) =>
                    siteSettings.setSettings(
                      setting.key,
                      (e.currentTarget as HTMLTextAreaElement).value
                    )
                  }
                />
                {setting.ui && (
                  <div>{setting.ui(siteSettings.settings[setting.key])}</div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="SettingsPage__section">
          <div className="SettingsPage__section__left">
            <Heading className="SettingsPage__section__left__title">
              User Preferences
            </Heading>
            <Text
              className="SettingsPage__section__body"
              size="body-sm"
              weight="semi-bold"
              color="gray"
            >
              <p>These settings are for you only.</p>
            </Text>
          </div>
          <div className="SettingsPage__section__right">
            <div className="SettingsPage__section__userPref">
              <div className="SettingsPage__section__userPref__description">
                <Text
                  className="SettingsPage__section__userPref__description__title"
                  size="body"
                  weight="semi-bold"
                >
                  Enable EditorJS Editor (legacy)
                </Text>
                <Text
                  className="SettingsPage__section__userPref__description__body"
                  size="body-sm"
                  weight="semi-bold"
                  color="gray"
                >
                  <p>
                    Replaces the{' '}
                    <a
                      href="https://lexical.dev/"
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                    >
                      Lexical
                    </a>{' '}
                    (default) rich text editor with the legacy{' '}
                    <a
                      href="https://editorjs.io/"
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                    >
                      EditorJS
                    </a>{' '}
                    version.
                  </p>
                </Text>
              </div>
              <div className="SettingsPage__section__userPref__input">
                <Switch
                  color="dark"
                  checked={userPrefs.preferences.EnableEditorJSEditor}
                  onChange={(e: Event) => {
                    const enabled = (e.currentTarget as HTMLInputElement)
                      .checked;
                    userPrefs.setPreference('EnableEditorJSEditor', enabled);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
