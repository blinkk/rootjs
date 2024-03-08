import {Heading} from '../../components/Heading/Heading.js';
import {ShareBox} from '../../components/ShareBox/ShareBox.js';
import {Text} from '../../components/Text/Text.js';
import {Layout} from '../../layout/Layout.js';
import './SettingsPage.css';

export function SettingsPage() {
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
      </div>
    </Layout>
  );
}
