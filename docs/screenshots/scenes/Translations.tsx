import {IconDownload, IconSparkles, IconUpload} from '@tabler/icons-preact';
import type {SceneMeta} from '../types.js';
import {Badge, CmsFrame} from '../ui/cms.js';

export const meta: SceneMeta = {
  id: 'cms-translations',
  width: 960,
  height: 600,
  alt: 'The Root CMS translations editor for a page, with source strings alongside German, French and Japanese translations and an AI translate action.',
};

const ROWS: Array<{source: string; de: string; fr: string; ja: string}> = [
  {
    source: 'Spring collection',
    de: 'Frühjahrskollektion',
    fr: 'Collection printemps',
    ja: '春のコレクション',
  },
  {
    source: 'Chase the first light of spring',
    de: 'Dem ersten Licht des Frühlings entgegen',
    fr: 'À la poursuite des premières lueurs du printemps',
    ja: '春の最初の光を追いかけて',
  },
  {
    source: 'Shop the collection',
    de: 'Kollektion entdecken',
    fr: 'Découvrir la collection',
    ja: '',
  },
  {
    source: 'Read the journal',
    de: 'Zum Journal',
    fr: 'Lire le journal',
    ja: '',
  },
  {
    source: 'Lightweight layers and trail-tested gear for early mornings.',
    de: 'Leichte Schichten und erprobte Ausrüstung für frühe Morgen.',
    fr: 'Des couches légères et un équipement éprouvé pour les petits matins.',
    ja: '',
  },
  {
    source: 'Free returns within 60 days',
    de: 'Kostenlose Rücksendung innerhalb von 60 Tagen',
    fr: 'Retours gratuits sous 60 jours',
    ja: '60日以内の返品は無料',
  },
];

/** The per-doc translations editor. */
export default function Translations() {
  return (
    <CmsFrame active="translations">
      <div style={{padding: '24px 28px', fontSize: '12.5px'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
          <h1 className="cms-h1">Translations</h1>
          <span className="cms-mono cms-muted" style={{fontSize: '12px'}}>
            Pages/spring-launch
          </span>
          <Badge variant="draft">3 missing</Badge>
          <span style={{marginLeft: 'auto', display: 'flex', gap: '6px'}}>
            <span className="cms-button">
              <IconDownload />
              Export
            </span>
            <span className="cms-button">
              <IconUpload />
              Import
            </span>
            <span className="cms-button cms-button--dark">
              <IconSparkles />
              Translate missing
            </span>
          </span>
        </div>
        <div style={{display: 'flex', gap: '6px', margin: '16px 0 14px'}}>
          <span className="cms-chip">Tags: Pages/spring-launch</span>
          <span className="cms-chip">Locales: de, fr, ja</span>
        </div>
        <table className="cms-table" style={{tableLayout: 'fixed'}}>
          <thead>
            <tr>
              <th style={{width: '28%'}}>Source (en)</th>
              <th>de</th>
              <th>fr</th>
              <th style={{width: '20%'}}>ja</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr>
                <td style={{fontWeight: 500}}>{row.source}</td>
                <td>{row.de}</td>
                <td>{row.fr}</td>
                <td
                  style={
                    row.ja
                      ? undefined
                      : {
                          background: '#fff9db',
                          color: '#b08900',
                          fontStyle: 'italic',
                        }
                  }
                >
                  {row.ja || 'Missing'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CmsFrame>
  );
}
