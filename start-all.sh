#!/bin/bash
SESSION="claude-main"

# Clean up old sessions
tmux kill-session -t "$SESSION" 2>/dev/null

# Clear stale bot sessions
cd ~/starweave
node -e "const db=require('better-sqlite3')('data/sessions.db');db.exec('DELETE FROM sessions')" 2>/dev/null

# Start bot in background window
tmux new-session -d -s "$SESSION" -n "queeny" "cd ~/starweave && node start-proxy.js"

# Open main window
tmux new-window -t "$SESSION" -n "claude" "cd ~ && bash"

# Show the shell window
tmux select-window -t "$SESSION:claude"

# Attach first, THEN set destroy-unattached (so it doesn't die before we connect)
tmux attach -t "$SESSION" \; set-option destroy-unattached on
