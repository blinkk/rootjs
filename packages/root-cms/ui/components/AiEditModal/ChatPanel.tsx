import {ChatBar, ChatWindow, useChat} from '../../pages/AIPage/AIPage.js';

export function ChatPanel(props: {
  children?: preact.ComponentChildren;
  /** Data supplied for the ChatBar to run in "edit mode". Typically this will be the JSON of the data being edited. */
  editModeData?: Record<string, any>;
  /** Callback for handling the response from "edit mode" requests from the ChatBar. */
  onEditModeResponse?: (data: any) => void;
}) {
  const chat = useChat();
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
