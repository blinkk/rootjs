import {defineGallery} from '../../dev/gallery/types.js';
import {PasswordInput} from './PasswordInput.js';

export const PasswordInputGallery = defineGallery({
  id: 'password-input',
  name: 'PasswordInput',
  group: 'Primitives',
  stories: {
    Basic: () => (
      <div className="flex max-w-sm flex-col gap-4">
        <PasswordInput
          label="Password"
          autoComplete="new-password"
          placeholder="Enter a new password"
        />
        <PasswordInput
          size="xs"
          aria-label="Password"
          autoComplete="new-password"
          defaultValue="hunter2"
        />
        <PasswordInput
          size="md"
          aria-label="Password"
          autoComplete="new-password"
          defaultValue="hunter2"
        />
      </div>
    ),
    States: () => (
      <div className="flex max-w-sm flex-col gap-4">
        <PasswordInput
          label="Password"
          autoComplete="new-password"
          defaultValue="short"
          error="Use at least 8 characters."
        />
        <PasswordInput
          label="Disabled"
          autoComplete="new-password"
          defaultValue="hunter2"
          disabled
        />
      </div>
    ),
  },
});
