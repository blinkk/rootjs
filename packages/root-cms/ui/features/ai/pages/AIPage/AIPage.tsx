/**
 * `/cms/ai` route. Thin wrapper around the shared {@link RootAIChat}
 * component (also used by the document-page side panel). The page variant
 * shows the chat history sidebar.
 */
import {Layout} from '../../../../app/layout/Layout.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {RootAIChat} from '../../components/RootAIChat/RootAIChat.js';

export function AIPage(props: {chatId?: string}) {
  usePageTitle('AI');
  return (
    <Layout>
      <RootAIChat variant="page" initialChatId={props.chatId} />
    </Layout>
  );
}
