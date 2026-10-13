# Configuration

Every setting has a default; set environment variables to change them (for `npm run dev`, `npm start`, or in a `.env` loaded by your shell). The model settings can also be changed from the app's Settings page, which wins over the environment.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | API (and production app) port |
| `DATA_DIR` | `./data` | books, figures, the vault, settings |
| `LLM_PROVIDER` | `auto` | `codex`, `claude` or `auto` (Settings overrides) |
| `CODEX_BIN` / `CLAUDE_BIN` | `codex` / `claude` | the CLIs |
| `CODEX_FAST_MODEL` | Codex's "fast and affordable" model | quick tier on Codex |
| `CODEX_FAST_EFFORT` | `low` | quick tier effort |
| `CODEX_MODEL` | from `~/.codex/config.toml` | careful tier, and hand-built demos |
| `CLAUDE_FAST_MODEL` / `CLAUDE_SMART_MODEL` | `sonnet` / `opus` | Claude Code tiers |
| `LLM_CONCURRENCY` | `3` | model calls at once |
| `CODEX_CONCURRENCY`, `CODEX_FIX_ROUNDS`, `CODEX_TIMEOUT_MS`, `CHROME_PATH` | | hand-built demos (see `server/config.ts`) |
| `HOST` | `127.0.0.1` | interface the server listens on. The API has no accounts: keep it on your machine (see [SECURITY.md](../SECURITY.md)) |
| `ALLOWED_HOSTS` | | extra host names to accept (comma-separated), for those who serve it on a network on purpose |
| `WEB_PORT` | `5173` | the Vite dev server's port (`npm run dev`) |
| `ANATOMY_SKILL_DIR` | | where `npm run sync:anatomy` looks for the anatomy skill |

During development, run a second copy on other ports with its own data, so your own vault is never touched:

```bash
DATA_DIR=/tmp/classroom-test PORT=8797 npx tsx server/index.ts
PORT=8797 WEB_PORT=5183 npx vite
```

## Limits

- Scanned PDFs need OCR first (text-based PDFs only).
- Figures are as true as the model's reading of the passage; every number they show comes from
  their own expressions, so check the readout against the text when it matters.
- Hand-built demos need Codex (they run in its sandbox).
- Agents that write need git (their changes are checked, merged and undone through the vault's history).
- Capture works on PDF pages; in EPUBs, pictures are already in the text.
- Speed and how much you can generate follow your plan's limits.
