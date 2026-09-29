import {
  IconBrandFigma,
  IconBrandGoogleDrive,
  IconChevronDown,
  IconChevronRight,
  IconDotsVertical,
  IconFolder,
  IconFolderPlus,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconUpload,
} from '@tabler/icons-preact';
import type {ComponentChildren} from 'preact';
import type {SceneMeta} from '../types.js';
import {Avatar, CmsFrame} from '../ui/cms.js';
import {GardenScene, VEGGIE_TINTS, Veggie} from '../ui/garden.js';
import type {VeggieKind} from '../ui/garden.js';

export const meta: SceneMeta = {
  id: 'cms-asset-library',
  width: 960,
  height: 600,
  alt: 'The Root CMS asset library, showing a folder of spring harvest images synced from Figma, a subfolder synced from Google Drive, and upload and sync actions.',
};

/** Height of a thumbnail, matching the CMS asset browser's 4:3 thumbs. */
const THUMB_HEIGHT = 36;
const THUMB_WIDTH = (THUMB_HEIGHT * 4) / 3;

type Row =
  | {
      type: 'folder';
      name: string;
      sync?: 'figma' | 'gdrive';
      by: string;
      when: string;
    }
  | {
      type: 'file';
      name: string;
      width: number;
      height: number;
      image: VeggieKind | 'garden';
      by: string;
      when: string;
    };

const ROWS: Row[] = [
  {
    type: 'folder',
    name: 'farm-photos',
    sync: 'gdrive',
    by: 'Sam',
    when: 'yesterday',
  },
  {type: 'folder', name: 'recipes', by: 'Priya', when: '3 days ago'},
  {
    type: 'file',
    name: 'hero-garden.png',
    width: 2400,
    height: 1200,
    image: 'garden',
    by: 'Kenji',
    when: '2 hours ago',
  },
  {
    type: 'file',
    name: 'hero-garden-mobile.png',
    width: 1080,
    height: 1350,
    image: 'garden',
    by: 'Kenji',
    when: '2 hours ago',
  },
  {
    type: 'file',
    name: 'heirloom-carrots.png',
    width: 1200,
    height: 1200,
    image: 'carrot',
    by: 'Kenji',
    when: '2 hours ago',
  },
  {
    type: 'file',
    name: 'chioggia-beets.png',
    width: 1200,
    height: 1200,
    image: 'beet',
    by: 'Kenji',
    when: '2 hours ago',
  },
];

/** A gray 4:3 thumbnail slot, like the CMS's `AssetThumbnail`. */
function Thumb(props: {children?: ComponentChildren; transparent?: boolean}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
        width: `${THUMB_WIDTH}px`,
        height: `${THUMB_HEIGHT}px`,
        borderRadius: '4px',
        background: props.transparent ? 'transparent' : 'var(--cms-chip)',
        color: 'var(--cms-text-muted)',
        overflow: 'hidden',
      }}
    >
      {props.children}
    </div>
  );
}

/** Renders an image fixture scaled to fit the thumbnail ("contain"). */
function ImageThumb(props: {
  image: VeggieKind | 'garden';
  width: number;
  height: number;
}) {
  const scale = Math.min(
    THUMB_WIDTH / props.width,
    THUMB_HEIGHT / props.height
  );
  const w = Math.round(props.width * scale);
  const h = Math.round(props.height * scale);
  if (props.image === 'garden') {
    return (
      <Thumb>
        <GardenScene style={{width: `${w}px`, height: `${h}px`}} />
      </Thumb>
    );
  }
  return (
    <Thumb>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: `${w}px`,
          height: `${h}px`,
          background: VEGGIE_TINTS[props.image],
        }}
      >
        <Veggie kind={props.image} size={h * 0.68} />
      </div>
    </Thumb>
  );
}

/** A small checkbox, as shown in the asset browser's selection column. */
function Checkbox() {
  return (
    <span
      style={{
        display: 'block',
        width: '14px',
        height: '14px',
        border: '1px solid #ced4da',
        borderRadius: '3px',
        background: '#fff',
      }}
    />
  );
}

/** The asset library, open to a Figma-synced folder. */
export default function AssetLibrary() {
  const cell = {padding: '7px 12px'};
  return (
    <CmsFrame active="assets">
      <div style={{padding: '22px 28px', fontSize: '12.5px'}}>
        <h1 className="cms-h1">Asset Library</h1>
        <p className="cms-muted" style={{margin: '6px 0 18px'}}>
          Store and organize the files used across the site. Replacing a file
          updates every draft doc that uses it.
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            <span className="cms-muted" style={{padding: '2px 6px'}}>
              Assets
            </span>
            <IconChevronRight size={14} color="#6b7280" />
            <span style={{padding: '2px 6px'}}>spring-harvest</span>
            <span className="cms-icon-button" style={{width: '24px'}}>
              <IconSettings />
            </span>
          </div>
          <div
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '170px',
                height: '28px',
                padding: '0 10px',
                border: '1px solid #ced4da',
                borderRadius: '4px',
                background: '#fff',
                color: '#adb5bd',
                fontSize: '12px',
              }}
            >
              <IconSearch size={14} />
              Search by name
            </div>
            <span className="cms-button">
              <IconRefresh />
              Sync
            </span>
            <span className="cms-button">
              <IconFolderPlus />
              New folder
            </span>
            <span className="cms-button cms-button--dark">
              <IconUpload />
              Upload
            </span>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px',
            padding: '6px 8px 6px 12px',
            border: '1px solid var(--cms-border)',
            borderRadius: '8px',
            background: '#f4f4f2',
          }}
        >
          <IconBrandFigma size={16} />
          <span>
            Synced from <strong>Figma</strong>
            <span className="cms-muted">
              {' '}
              · last synced 2 hours ago by kenji@fernwood.example
            </span>
          </span>
          <span
            className="cms-icon-button"
            style={{marginLeft: 'auto', width: '24px', height: '24px'}}
          >
            <IconSettings />
          </span>
        </div>
        <table className="cms-table" style={{borderRadius: '8px'}}>
          <thead>
            <tr>
              <th style={{width: '1px', paddingRight: 0}}>
                <Checkbox />
              </th>
              <th>name</th>
              <th style={{width: '190px'}}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: 'var(--cms-text)',
                  }}
                >
                  modified
                  <IconChevronDown size={12} stroke={2.5} />
                </span>
              </th>
              <th style={{width: '1px'}}></th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr>
                <td style={{...cell, paddingRight: 0}}>
                  <Checkbox />
                </td>
                <td style={cell}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    {row.type === 'folder' ? (
                      <Thumb transparent>
                        <IconFolder size={24} stroke={1.5} />
                      </Thumb>
                    ) : (
                      <ImageThumb
                        image={row.image}
                        width={row.width}
                        height={row.height}
                      />
                    )}
                    <span style={{fontWeight: 500}}>
                      {row.name}
                      {row.type === 'file' && (
                        <span className="cms-muted" style={{fontWeight: 400}}>
                          {` (${row.width}x${row.height})`}
                        </span>
                      )}
                    </span>
                    {row.type === 'folder' && row.sync === 'gdrive' && (
                      <span
                        className="cms-chip"
                        style={{color: 'var(--cms-text-muted)'}}
                      >
                        <IconBrandGoogleDrive size={12} />
                        Google Drive
                      </span>
                    )}
                  </div>
                </td>
                <td style={cell}>
                  <span
                    style={{display: 'flex', alignItems: 'center', gap: '8px'}}
                  >
                    <Avatar name={row.by} />
                    {row.when}
                  </span>
                </td>
                <td style={cell}>
                  <span
                    className="cms-icon-button"
                    style={{width: '22px', height: '22px'}}
                  >
                    <IconDotsVertical size={16} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CmsFrame>
  );
}
