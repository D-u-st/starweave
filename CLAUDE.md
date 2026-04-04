# Starweave

Lightweight Claude Code messaging bridge. ~900 lines of TypeScript.

## Commands

```bash
npm install        # Install dependencies
npm run build      # Compile TypeScript
npm start          # Start bot (via start-proxy.js)
npm run rebuild    # Clean + rebuild
```

## Architecture

```
Discord @mention → index.ts → SessionManager → Session → BridgeManager
                                                              ↓
                                                    tmux send-keys → Claude Code
                                                              ↓
                                                    capture-pane (poll 800ms)
                                                              ↓
                                                    isIdle + stable check
                                                              ↓
                                                    extractLastClaudeResponse
                                                              ↓
                                                    chunkDiscordText (fence-aware split)
                                                              ↓
                                                    Discord reply
```

Bridge mode: connects to an existing `claude-main` tmux session. User runs Claude Code manually, bot sends Discord messages into that session via `tmux send-keys` and captures output via `tmux capture-pane`.

## Source Files (7 files, ~900 lines)

| File | Lines | Purpose |
|------|-------|---------|
| `src/index.ts` | 139 | Discord client, message handler, /stop /status commands |
| `src/claude/session-manager.ts` | 190 | Session CRUD, SQLite persistence (better-sqlite3) |
| `src/claude/bridge-manager.ts` | 164 | Core: tmux interaction, idle detection, output extraction |
| `src/utils/chunk.ts` | 154 | Fence-aware Discord message splitting |
| `src/claude/session.ts` | 126 | Single session lifecycle, EventEmitter |
| `src/utils/logger.ts` | 77 | Winston logger with daily rotation |
| `src/config.ts` | 65 | Environment variable loading |

## Key Design Decisions

- **Bridge mode only** — no spawning new Claude Code processes, connects to your existing session
- **Screen stability detection** — waits for tmux screen to be unchanged for 3 consecutive checks before extracting response
- **Minimum 5s response wait** — prevents capturing spinners/loading text
- **Fence-aware chunking** — long responses split at 2000 chars with code block continuity
- **WebSocket proxy patch** — `start-proxy.js` monkey-patches `ws` module for proxy support (discord.js doesn't natively support HTTP proxy for WebSocket)
- **better-sqlite3** — synchronous API, no callback hell

## Startup

`start-all.sh` creates a tmux session with two windows:
1. `queeny` — bot process (background)
2. `claude` — shell for user to manually start Claude Code
