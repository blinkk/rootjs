import {RichTextData} from '../../../../shared/richtext.js';
import {cn, joinClassNames} from '../../../utils/classes.js';
import {LexicalEditor} from '../../documents/components/RichTextEditor/lexical/LexicalEditor.js';

export interface CommentEditorProps {
  className?: string;
  placeholder?: string;
  value?: RichTextData | null;
  onChange?: (value: RichTextData | null) => void;
  autoFocus?: boolean;
  /**
   * Editor chrome. `default` shows the formatting toolbar above the editor
   * (used by tasks). `minimal` hides it, leaving only the floating toolbar
   * that appears when text is selected (used by field comments).
   */
  variant?: 'default' | 'minimal';
  /** Enables `@mention` autocomplete of project users. Defaults to true. */
  mentions?: boolean;
  /** Called when the user presses Cmd+Enter (or Ctrl+Enter) in the editor. */
  onSubmitShortcut?: () => void;
  /** Called when the user pastes files (e.g. a screenshot) into the editor. */
  onPasteFiles?: (files: File[]) => void;
}

/**
 * Lightweight rich text editor for comments, shared by the task manager and
 * field comments. Supports `@mention` autocomplete of project users.
 *
 * Example:
 *   <CommentEditor
 *     variant="minimal"
 *     value={body}
 *     onChange={setBody}
 *     onSubmitShortcut={submit}
 *   />
 */
export function CommentEditor(props: CommentEditorProps) {
  const variant = props.variant || 'default';

  function submitShortcut(e: KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    props.onSubmitShortcut?.();
  }

  /**
   * Handles the submit shortcut in the editor text. Runs in the capture phase,
   * before the editor handles Enter, which would otherwise insert a new
   * paragraph or list item before submitting. While the `@mention` menu is
   * open, the editor gets the key so it can select the highlighted user.
   */
  function onKeyDownCapture(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (
      isSubmitShortcut(e) &&
      target.isContentEditable &&
      !isMentionMenuOpen(target)
    ) {
      submitShortcut(e);
    }
  }

  /**
   * Handles the submit shortcut in other fields inside the editor (e.g. the
   * link editor's URL field), after the field handles the key itself.
   */
  function onKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (isSubmitShortcut(e) && !target.isContentEditable) {
      submitShortcut(e);
    }
  }

  function onPaste(e: ClipboardEvent) {
    if (!props.onPasteFiles) {
      return;
    }
    const files = Array.from(e.clipboardData?.files || []);
    if (files.length > 0) {
      props.onPasteFiles(files);
    }
  }

  return (
    <div
      className={joinClassNames(
        'CommentEditor__wrap',
        variant === 'minimal' && 'CommentEditor__wrap--minimal'
      )}
      onKeyDownCapture={onKeyDownCapture}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
    >
      <LexicalEditor
        className={cn('CommentEditor w-full', props.className)}
        placeholder={props.placeholder}
        value={props.value}
        onChange={props.onChange}
        autoFocus={props.autoFocus}
        autosize
        variant="comment"
        hideToolbar={variant === 'minimal'}
        mentions={props.mentions !== false}
      />
    </div>
  );
}

/** Returns true for Cmd+Enter (or Ctrl+Enter). */
function isSubmitShortcut(e: KeyboardEvent) {
  return e.key === 'Enter' && (e.metaKey || e.ctrlKey);
}

/**
 * Returns true when the `@mention` menu is showing suggestions for the editor
 * containing `target`. Lexical's typeahead points the editor's
 * `aria-controls` at the menu's container while a query is active.
 */
function isMentionMenuOpen(target: HTMLElement) {
  const root = target.closest('[aria-controls]');
  const menuId = root?.getAttribute('aria-controls');
  if (!menuId) {
    return false;
  }
  const menu = document.getElementById(menuId);
  return Boolean(menu?.querySelector('.MentionsPlugin__menu'));
}
