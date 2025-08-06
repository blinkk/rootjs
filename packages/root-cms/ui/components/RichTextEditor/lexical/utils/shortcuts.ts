import {IS_APPLE} from '@lexical/utils';
import {isModifierMatch} from 'lexical';

export const SHORTCUTS = Object.freeze({
  // (Ctrl|⌘) + (Alt|Option) + <key> shortcuts
  NORMAL: IS_APPLE ? '⌘+Opt+0' : 'Ctrl+Alt+0',
  HEADING1: IS_APPLE ? '⌘+Opt+1' : 'Ctrl+Alt+1',
  HEADING2: IS_APPLE ? '⌘+Opt+2' : 'Ctrl+Alt+2',
  HEADING3: IS_APPLE ? '⌘+Opt+3' : 'Ctrl+Alt+3',
  NUMBERED_LIST: IS_APPLE ? '⌘+Shift+7' : 'Ctrl+Shift+7',
  BULLET_LIST: IS_APPLE ? '⌘+Shift+8' : 'Ctrl+Shift+8',

  // (Ctrl|⌘) + Shift + <key> shortcuts
  STRIKETHROUGH: IS_APPLE ? '⌘+Shift+X' : 'Ctrl+Shift+X',

  // (Ctrl|⌘) + <key> shortcuts
  SUBSCRIPT: IS_APPLE ? '⌘+,' : 'Ctrl+,',
  SUPERSCRIPT: IS_APPLE ? '⌘+.' : 'Ctrl+.',
  INDENT: IS_APPLE ? '⌘+]' : 'Ctrl+]',
  OUTDENT: IS_APPLE ? '⌘+[' : 'Ctrl+[',
  CLEAR_FORMATTING: IS_APPLE ? '⌘+\\' : 'Ctrl+\\',
  REDO: IS_APPLE ? '⌘+Shift+Z' : 'Ctrl+Y',
  UNDO: IS_APPLE ? '⌘+Z' : 'Ctrl+Z',
  BOLD: IS_APPLE ? '⌘+B' : 'Ctrl+B',
  ITALIC: IS_APPLE ? '⌘+I' : 'Ctrl+I',
  UNDERLINE: IS_APPLE ? '⌘+U' : 'Ctrl+U',
  INSERT_LINK: IS_APPLE ? '⌘+K' : 'Ctrl+K',
});

const CONTROL_OR_META = {ctrlKey: !IS_APPLE, metaKey: IS_APPLE};

export function isFormatParagraph(event: KeyboardEvent): boolean {
  const {code} = event;

  return (
    (code === 'Numpad0' || code === 'Digit0') &&
    isModifierMatch(event, {...CONTROL_OR_META, altKey: true})
  );
}

export function isFormatHeading(event: KeyboardEvent): boolean {
  const {code} = event;
  const keyNumber = code[code.length - 1];

  return (
    ['1', '2', '3'].includes(keyNumber) &&
    isModifierMatch(event, {...CONTROL_OR_META, altKey: true})
  );
}

export function isFormatNumberedList(event: KeyboardEvent): boolean {
  const {code} = event;
  return (
    (code === 'Numpad7' || code === 'Digit7') &&
    isModifierMatch(event, {...CONTROL_OR_META, shiftKey: true})
  );
}

export function isFormatBulletList(event: KeyboardEvent): boolean {
  const {code} = event;
  return (
    (code === 'Numpad8' || code === 'Digit8') &&
    isModifierMatch(event, {...CONTROL_OR_META, shiftKey: true})
  );
}

export function isStrikeThrough(event: KeyboardEvent): boolean {
  const {code} = event;
  return (
    code === 'KeyX' &&
    isModifierMatch(event, {...CONTROL_OR_META, shiftKey: true})
  );
}

export function isIndent(event: KeyboardEvent): boolean {
  const {code} = event;
  return code === 'BracketRight' && isModifierMatch(event, CONTROL_OR_META);
}

export function isOutdent(event: KeyboardEvent): boolean {
  const {code} = event;
  return code === 'BracketLeft' && isModifierMatch(event, CONTROL_OR_META);
}

export function isSubscript(event: KeyboardEvent): boolean {
  const {code} = event;
  return code === 'Comma' && isModifierMatch(event, CONTROL_OR_META);
}

export function isSuperscript(event: KeyboardEvent): boolean {
  const {code} = event;
  return code === 'Period' && isModifierMatch(event, CONTROL_OR_META);
}

export function isClearFormatting(event: KeyboardEvent): boolean {
  const {code} = event;
  return code === 'Backslash' && isModifierMatch(event, CONTROL_OR_META);
}

export function isInsertLink(event: KeyboardEvent): boolean {
  const {code} = event;
  return code === 'KeyK' && isModifierMatch(event, CONTROL_OR_META);
}
