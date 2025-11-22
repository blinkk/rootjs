export interface SpecialCharacter {
  /** The actual special character to highlight. */
  char: string;
  /** Human-readable label for the character. */
  label: string;
}

export interface SpecialCharacterMatch extends SpecialCharacter {
  /** Index of the character inside the analyzed string. */
  index: number;
}

export const SPECIAL_CHARACTERS: SpecialCharacter[] = [
  {
    char: '\u00A0',
    label: 'Non-breaking space',
  },
  {
    char: '\u2011',
    label: 'Non-breaking hyphen',
  },
];

const regexBody = SPECIAL_CHARACTERS.map((item) =>
  `\\u${item.char.codePointAt(0)?.toString(16).padStart(4, '0')}`
).join('');

export const SPECIAL_CHARACTER_REGEX = new RegExp(`[${regexBody}]`, 'g');

/**
 * Returns a list of matches for special unicode characters within the provided
 * text.
 */
export function findSpecialCharacters(text: string): SpecialCharacterMatch[] {
  const matches: SpecialCharacterMatch[] = [];
  if (!text) {
    return matches;
  }
  let match: RegExpExecArray | null;
  SPECIAL_CHARACTER_REGEX.lastIndex = 0;
  while ((match = SPECIAL_CHARACTER_REGEX.exec(text)) !== null) {
    const char = match[0];
    const characterDef = SPECIAL_CHARACTERS.find((item) => item.char === char);
    if (!characterDef) {
      continue;
    }
    matches.push({
      ...characterDef,
      index: match.index,
    });
  }
  return matches;
}
