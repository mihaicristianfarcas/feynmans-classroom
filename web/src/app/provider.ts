/* The model CLIs as the app names them, whether the one in use can take requests, and what to do when
 * it can't: for the choice in Settings and the notices on the library and first-run pages. */
import type { Provider, SettingsInfo } from "../api";

export const PROVIDER_NAMES: Record<Provider, string> = {
  codex: "Codex",
  claude: "Claude Code",
  opencode: "OpenCode",
};

/** Whether a provider (the one in use, by default) can take requests: installed, and logged in for Codex. */
export function providerReady(info: SettingsInfo, provider: Provider = info.active): boolean {
  return provider === "codex" ? info.codex.installed && info.codex.loggedIn : info[provider].installed;
}

/** Why a provider can't take requests, with what to do about it ("Codex isn’t logged in (run codex login)"). */
export function providerProblem(info: SettingsInfo, provider: Provider = info.active): string {
  if (provider === "codex")
    return info.codex.installed
      ? "Codex isn’t logged in (run codex login)"
      : "Codex isn’t installed (npm i -g @openai/codex)";
  if (provider === "claude") return "Claude Code isn’t installed (npm i -g @anthropic-ai/claude-code)";
  return info.opencode.version
    ? "OpenCode 2 is needed (run opencode upgrade --major)"
    : "OpenCode isn’t installed (npm i -g @opencode/cli)";
}
