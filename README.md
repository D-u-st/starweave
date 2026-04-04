# Starweave

Lightweight Claude Code messaging bridge. Control Claude Code from your phone via Discord.

**899 lines of TypeScript. 7 files. 6 dependencies. Zero bloat.**

## What it does

```
You (Discord) → Starweave → tmux send-keys → Claude Code → capture output → Discord reply
```

Send a message to your Discord bot, it gets forwarded to your running Claude Code session. Claude's response gets sent back to Discord. Your phone becomes a remote Claude Code terminal.

## Why

- Use your Claude Max subscription (not API) — no per-token costs
- See the full Claude Code session in tmux when you're at your desk
- Continue conversations seamlessly between phone and desktop
- 899 lines vs OpenClaw's 1.7M lines for the same core functionality

## Prerequisites

- Node.js >= 18
- tmux
- Claude Code CLI (installed and logged in)

## Quick Start

```bash
git clone https://github.com/D-u-st/starweave.git
cd starweave
npm install
npm run build
cp .env.example .env  # Fill in your Discord bot token
```

### Discord Bot Setup

1. Create a Discord bot at [discord.com/developers](https://discord.com/developers/applications)
2. Enable **Message Content Intent** in bot settings
3. Invite bot to your server with permissions: Send Messages, Read Message History
4. Fill in `.env` with your bot token, client ID, guild ID

### Run

```bash
# One-click: starts bot + opens shell for Claude Code
bash start-all.sh

# Then in the shell, start Claude Code however you like:
claude
claude --resume
claude --dangerously-skip-permissions
```

Or manually:
```bash
# Terminal 1: start Claude Code in a tmux session named "claude-main"
tmux new-session -s claude-main
claude

# Terminal 2: start the bot
node start-proxy.js
```

### Windows Terminal Integration

Add a profile in Windows Terminal settings for one-click launch:
```json
{
  "name": "Starweave",
  "commandline": "wsl bash -c \"bash ~/starweave/start-all.sh\"",
  "icon": "✨"
}
```

## Commands

In Discord, mention the bot to send messages:
```
@Starweave write a Python HTTP server with /time and /health endpoints
```

Built-in commands:
- `@Starweave /stop` — shut down the bot
- `@Starweave /status` — show current session info

## Architecture

| File | Lines | Purpose |
|------|-------|---------|
| `src/index.ts` | 120 | Discord client, message handler, commands |
| `src/claude/bridge-manager.ts` | 165 | tmux interaction, idle detection, output extraction |
| `src/claude/session-manager.ts` | 190 | Session CRUD, SQLite persistence (better-sqlite3) |
| `src/claude/session.ts` | 126 | Session lifecycle, EventEmitter |
| `src/utils/chunk.ts` | 154 | Fence-aware Discord message splitting |
| `src/config.ts` | 67 | Environment variable loading |
| `src/utils/logger.ts` | 77 | Winston logger with daily rotation |

## How it works

1. Bot connects to Discord, listens for @mentions
2. On message, creates/reuses a session linked to the Discord channel
3. Session uses `BridgeManager` to connect to existing `claude-main` tmux session
4. Message sent via `tmux send-keys`
5. Output captured by polling `tmux capture-pane` every 800ms
6. Waits for Claude to finish (idle detection + screen stability check)
7. Extracts Claude's response, filters UI noise, sends to Discord
8. Long responses are split with code-fence awareness (no broken code blocks)

## Proxy Support

If Discord is blocked in your network, `start-proxy.js` patches the `ws` module to route WebSocket through an HTTP proxy. Set `HTTPS_PROXY` in `.env`.

## License

MIT
