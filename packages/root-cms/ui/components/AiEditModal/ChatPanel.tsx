import {ChatBar} from '../ChatBar/ChatBar.js';
import {useLegacyChat} from '../ChatBar/legacyChat.js';
import {ChatWindow} from '../ChatBar/LegacyChatView.js';

interface ChatPanelProps {
  children?: preact.ComponentChildren;
  /** Data supplied for the ChatBar to run in "edit mode". Typically this will be the JSON of the data being edited. */
  editModeData?: Record<string, any>;
  /** Callback for handling the response from "edit mode" requests from the ChatBar. */
  onEditModeResponse?: (data: any) => void;
}

export function ChatPanel(props: ChatPanelProps) {
  const chat = useLegacyChat();
  return (
    <>
      <ChatWindow chat={chat} children={props.children} />
      <ChatBar
        chat={chat}
        options={{mode: 'edit', editData: props.editModeData}}
        onData={props.onEditModeResponse}
      />
    </>
  );
}
