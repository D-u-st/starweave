# Starweave

Lightweight Claude Code messaging bridge. 841 lines of TypeScript.

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
                                                    Discord reply
```

Bridge mode: connects to an existing `claude-main` tmux session. User runs Claude Code manually, bot sends Discord messages into that session via `tmux send-keys` and captures output via `tmux capture-pane`.

## Source Files (7 files, 841 lines)

| File | Lines | Purpose |
|------|-------|---------|
| `src/index.ts` | 125 | Discord client, message handler, startup |
| `src/claude/session-manager.ts` | 224 | Session CRUD, SQLite persistence |
| `src/claude/session.ts` | 129 | Single session lifecycle, EventEmitter |
| `src/claude/bridge-manager.ts` | 165 | Core: tmux interaction, idle detection, output extraction |
| `src/claude/output-parser.ts` | 54 | Format Claude output for Discord |
| `src/config.ts` | 67 | Environment variable loading |
| `src/utils/logger.ts` | 77 | Winston logger |

## Key Design Decisions

- **Bridge mode only** — no spawning new Claude Code processes, connects to your existing session
- **Screen stability detection** — waits for tmux screen to be unchanged for 3 consecutive checks before extracting response
- **Minimum 5s response wait** — prevents capturing spinners/loading text
- **WebSocket proxy patch** — `start-proxy.js` monkey-patches `ws` module for proxy support (discord.js doesn't natively support HTTP proxy for WebSocket)

## Startup

`start-all.sh` creates a tmux session with two windows:
1. `queeny` — bot process (background)
2. `claude` — shell for user to manually start Claude Code
