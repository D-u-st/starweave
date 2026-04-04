# Starweave

Lightweight Claude Code messaging bridge. Control Claude Code from your phone via Discord.

**841 lines of TypeScript. 6 dependencies. Zero bloat.**

## What it does

```
You (Discord) → Starweave → tmux send-keys → Claude Code → capture output → Discord reply
```

Send a message to your Discord bot, it gets forwarded to your running Claude Code session. Claude's response gets sent back to Discord. Your phone becomes a remote Claude Code terminal.

## Why

- Use your Claude Max subscription (not API) — no per-token costs
- See the full Claude Code session in tmux when you're at your desk
- Continue conversations seamlessly between phone and desktop
- 841 lines vs OpenClaw's 1.7M lines for the same core functionality

## Quick Start

```bash
git clone https://github.com/D-u-st/starweave.git
cd starweave
npm install
npm run build
cp .env.example .env  # Fill in your Discord bot token
```

### Setup

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

### Usage

In Discord, mention the bot:
```
@Starweave write a Python HTTP server with /time and /health endpoints
```

The message gets sent to Claude Code. When Claude finishes, the response appears in Discord.

## Architecture

| File | Lines | Purpose |
|------|-------|---------|
| `src/index.ts` | 125 | Discord client + message handler |
| `src/claude/bridge-manager.ts` | 165 | tmux interaction + output capture |
| `src/claude/session-manager.ts` | 224 | Session persistence (SQLite) |
| `src/claude/session.ts` | 129 | Session lifecycle |
| `src/claude/output-parser.ts` | 54 | Format output for Discord |
| `src/config.ts` | 67 | Config loading |
| `src/utils/logger.ts` | 77 | Logging |

## How it works

1. Bot connects to Discord, listens for @mentions
2. On message, creates/reuses a session linked to the Discord channel
3. Session uses `BridgeManager` to connect to existing `claude-main` tmux session
4. Message sent via `tmux send-keys`
5. Output captured by polling `tmux capture-pane` every 800ms
6. Waits for Claude to finish (idle detection + screen stability check)
7. Extracts Claude's response, filters UI noise, sends to Discord

## Proxy Support

If Discord is blocked in your network, `start-proxy.js` patches the `ws` module to route WebSocket through an HTTP proxy. Set `HTTPS_PROXY` in `.env`.

## License

MIT
