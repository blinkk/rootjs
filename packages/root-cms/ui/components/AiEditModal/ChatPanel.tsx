import {ChatBar, ChatWindow, useChat} from '../../pages/AIPage/AIPage.js';

export function ChatPanel(props: {
  editModeData?: Record<string, any>;
  onEditModeResponse?: (data: any) => void;
}) {
  const chat = useChat();
  return (
    <>
      <ChatWindow chat={chat} />
      <ChatBar
        chat={chat}
        options={{mode: 'edit', editData: props.editModeData}}
        onData={props.onEditModeResponse}
      />
    </>
  );
}
