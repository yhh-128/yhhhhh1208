import { DebugPanel } from './components/DebugPanel';
import { useChat } from './hooks/useChat';
import { ChatScreen } from './screens/ChatScreen';
import { JoinScreen } from './screens/JoinScreen';
import { chatService } from './services';

const showDebug = new URLSearchParams(location.search).has('debug');

export function App() {
  const chat = useChat(chatService);

  return (
    <>
      {chat.phase === 'chat' ? (
        <ChatScreen
          self={chat.self}
          items={chat.items}
          users={chat.users}
          connection={chat.connection}
          onSend={chat.send}
          onLeave={chat.leave}
        />
      ) : (
        <JoinScreen
          initialNickname={chat.draftNickname}
          error={chat.joinError}
          lostNickname={chat.lostNickname}
          busy={chat.phase === 'joining'}
          onSubmit={chat.join}
        />
      )}
      {showDebug && chatService.debug && <DebugPanel debug={chatService.debug} />}
    </>
  );
}
