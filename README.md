# opencode-key-plugin

Keep API keys out of LLM context in opencode.

- Auto-captures keys pasted in chat into a `0600` vault (`key-store.json`) — the model never sees raw values
- Redacts keys from chat messages, scrubs tool output, blocks bash commands that would print a stored key
- Exposes a `key` tool (`list`, `get`, `set`, `rm`, `to-file`) + a `/key` command
- Injects stored keys as env vars into shell processes (e.g. `$ANTHROPIC_API_KEY`)

## What's inside

- `plugin/index.js` — plugin hooks + `key` tool
- `plugin/store.js` — `0600` vault + `.env` writer + output scrubber
- `plugin/rules.js` + `plugin/rules.json` — key detection patterns
- `command/key.md` — `/key` command definition

## Setup

```bash
git clone https://github.com/taisy03/opencode-key-plugin.git
cd opencode-key-plugin
./install.sh
```

That copies the plugin to `~/.config/opencode/plugins/`, the command to
`~/.config/opencode/commands/`, and installs `@opencode-ai/plugin`.
Then restart opencode.

### Manual setup

1. Copy `plugin/` → `~/.config/opencode/plugins/`
2. Copy `command/key.md` → `~/.config/opencode/commands/key.md`
3. In `~/.config/opencode`, run `npm install @opencode-ai/plugin@1.17.1`
4. Restart opencode

## Usage

- `/key list` — show stored env var names
- `/key set ANTHROPIC_API_KEY` — prompts at your terminal (keystrokes never pass through the model)
- `/key get ANTHROPIC_API_KEY` — presence + last 4 chars only, never the value
- Paste a key in chat and it's auto-captured + redacted to `[KEY ENV_VAR stored]`

## Security notes

- Secrets live only in `~/.config/opencode/key-store.json` (`0600`). That file is
  gitignored here and never committed.
- This repo contains no keys — only detection patterns and code.
- Never paste a real key into GitHub issues or PRs for this repo.
