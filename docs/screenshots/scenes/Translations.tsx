import {IconDownload, IconRobot, IconUpload} from '@tabler/icons-preact';
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
    source: 'Spring harvest',
    de: 'Frühjahrsernte',
    fr: 'Récolte de printemps',
    ja: '春の収穫',
  },
  {
    source: 'Dig into the spring harvest',
    de: 'Entdecke die Frühjahrsernte',
    fr: 'Plongez dans la récolte de printemps',
    ja: '春の収穫を味わおう',
  },
  {
    source: 'Shop the market',
    de: 'Zum Marktstand',
    fr: 'Faire son marché',
    ja: '',
  },
  {
    source: 'Visit the garden center',
    de: 'Zum Gartencenter',
    fr: 'Visiter la jardinerie',
    ja: '',
  },
  {
    source: 'Heirloom carrots, candy-striped beets and peppery radishes.',
    de: 'Alte Karottensorten, geringelte Bete und würzige Radieschen.',
    fr: 'Carottes anciennes, betteraves rayées et radis poivrés.',
    ja: '',
  },
  {
    source: 'Picked up the road, sold the same day',
    de: 'Aus der Nachbarschaft, am selben Tag verkauft',
    fr: 'Cueilli tout près, vendu le jour même',
    ja: '近くの畑から、その日のうちに',
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
            Pages/spring-harvest
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
              <IconRobot />
              Translate missing
            </span>
          </span>
        </div>
        <div style={{display: 'flex', gap: '6px', margin: '16px 0 14px'}}>
          <span className="cms-chip">Tags: Pages/spring-harvest</span>
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
