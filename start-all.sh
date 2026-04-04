#!/bin/bash
SESSION="claude-main"

# Clean up old sessions
tmux kill-session -t "$SESSION" 2>/dev/null

# Clear stale bot sessions
cd ~/starweave
node -e "const db=require('better-sqlite3')('data/sessions.db');db.exec('DELETE FROM sessions')" 2>/dev/null

# Start bot as background process (dies when tmux session dies)
tmux new-session -d -s "$SESSION" -n "claude" \
  "cd ~/starweave && node start-proxy.js & BOT_PID=\$!; cd ~; bash; kill \$BOT_PID 2>/dev/null"

# Attach
tmux attach -t "$SESSION"
