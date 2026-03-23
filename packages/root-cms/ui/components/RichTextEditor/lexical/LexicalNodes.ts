/** Shared Lexical node registrations used by both the editor and read-only renderer. */

import {AutoLinkNode, LinkNode} from '@lexical/link';
import {ListItemNode, ListNode} from '@lexical/list';
import {HorizontalRuleNode} from '@lexical/react/LexicalHorizontalRuleNode';
import {HeadingNode, QuoteNode} from '@lexical/rich-text';
import {TableCellNode, TableNode, TableRowNode} from '@lexical/table';
import {Klass, LexicalNode} from 'lexical';
import {BlockComponentNode} from './nodes/BlockComponentNode.js';
import {InlineComponentNode} from './nodes/InlineComponentNode.js';
import {SpecialCharacterNode} from './nodes/SpecialCharacterNode.js';

export const LEXICAL_NODES: Klass<LexicalNode>[] = [
  AutoLinkNode,
  HeadingNode,
  QuoteNode,
  LinkNode,
  ListNode,
  ListItemNode,
  HorizontalRuleNode,
  TableNode,
  TableCellNode,
  TableRowNode,
  BlockComponentNode,
  InlineComponentNode,
  SpecialCharacterNode,
];
