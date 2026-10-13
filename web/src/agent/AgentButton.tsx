/* The sparkle in the top bar (and the reader's bar) that opens the agent; a dot on it while a request
 * is being worked on. */
import { Sparkles } from "lucide-react";
import { AGENT_KEYS } from "./AgentPanel";
import { openAgent, useAgent } from "./store";

export function AgentButton() {
  const { busy } = useAgent();
  const mac = AGENT_KEYS.startsWith("⌘");
  return (
    <button
      type="button"
      className="icon-button agent-button"
      data-busy={busy || undefined}
      onClick={() => openAgent()}
      aria-label={busy ? "Agent, working" : "Agent"}
      aria-haspopup="dialog"
      aria-keyshortcuts={mac ? "Meta+J" : "Control+J"}
      title={`Ask or tell the agent (${AGENT_KEYS})`}
    >
      <Sparkles aria-hidden="true" />
    </button>
  );
}
