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

# Kill entire session when client detaches (i.e. terminal tab closed)
tmux set-option -t "$SESSION" destroy-unattached on

# Show the shell window
tmux select-window -t "$SESSION:claude"
tmux attach -t "$SESSION"
