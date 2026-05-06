/**
 * @fileoverview A lightweight read-only Lexical renderer. Renders RichTextData
 * using the same Lexical nodes and theme as the full editor, but with no
 * editing capabilities or toolbar.
 */

import {
  InitialConfigType,
  LexicalComposer,
} from '@lexical/react/LexicalComposer';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import {LexicalErrorBoundary} from '@lexical/react/LexicalErrorBoundary';
import {RichTextPlugin} from '@lexical/react/LexicalRichTextPlugin';
import {useEffect} from 'preact/hooks';
import {RichTextData} from '../../../../shared/richtext.js';
import {LEXICAL_NODES} from './LexicalNodes.js';
import {LexicalTheme} from './LexicalTheme.js';
import {convertToLexical} from './utils/convert-to-lexical.js';

const READ_ONLY_CONFIG: InitialConfigType = {
  namespace: 'RootCMS_ReadOnly',
  theme: LexicalTheme,
  editable: false,
  nodes: LEXICAL_NODES,
  onError: (err: Error) => {
    console.error('[LexicalReadOnly] error:', err);
  },
};

export interface LexicalReadOnlyProps {
  value: RichTextData;
  className?: string;
}

export function LexicalReadOnly(props: LexicalReadOnlyProps) {
  return (
    <LexicalComposer initialConfig={READ_ONLY_CONFIG}>
      <LoadValuePlugin value={props.value} />
      <RichTextPlugin
        contentEditable={<ContentEditable className={props.className} />}
        ErrorBoundary={LexicalErrorBoundary}
      />
    </LexicalComposer>
  );
}

/** Loads a RichTextData value into the read-only editor. */
function LoadValuePlugin(props: {value: RichTextData}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.update(() => {
      convertToLexical(props.value);
    });
  }, [editor, props.value]);
  return null;
}
