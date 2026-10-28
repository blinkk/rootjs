import {IconRobot} from '@tabler/icons-preact';
import {defineGallery} from '../../dev/gallery/types.js';
import {Avatar, type AvatarSize} from './Avatar.js';

const SIZES: AvatarSize[] = ['xs', 'sm', 'md', 'lg', 'xl'];

/** A stand-in profile photo, inlined so the gallery works offline. */
const PHOTO =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
      '<rect width="40" height="40" fill="#0e7490"/>' +
      '<circle cx="20" cy="16" r="7" fill="#cffafe"/>' +
      '<path d="M6 40c2-9 8-13 14-13s12 4 14 13z" fill="#cffafe"/>' +
      '</svg>'
  );

export const AvatarGallery = defineGallery({
  id: 'avatar',
  name: 'Avatar',
  group: 'Primitives',
  stories: {
    Sizes: () => (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {SIZES.map((size) => (
            <Avatar key={size} size={size} src={PHOTO} alt="Ada Lovelace" />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {SIZES.map((size) => (
            <Avatar key={size} size={size} alt="Ada Lovelace">
              AL
            </Avatar>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {SIZES.map((size) => (
            <Avatar key={size} size={size} alt="Unknown user" />
          ))}
        </div>
      </div>
    ),
    Fallbacks: () => (
      <div className="flex flex-wrap items-center gap-2">
        <Avatar alt="Grace Hopper" className="bg-info text-inverse">
          GH
        </Avatar>
        <Avatar alt="Margaret Hamilton" className="bg-success text-inverse">
          MH
        </Avatar>
        <Avatar alt="3 more viewers">+3</Avatar>
        <Avatar alt="Root AI">
          <IconRobot size={16} />
        </Avatar>
        <Avatar alt="Logo" square size="lg" src={PHOTO} />
        <Avatar alt="Team" square size="lg">
          RT
        </Avatar>
      </div>
    ),
    'In context': () => (
      <div className="flex items-center gap-2 text-sm">
        <Avatar size="xs" src={PHOTO} />
        <span className="truncate">ada@example.com</span>
      </div>
    ),
  },
});
