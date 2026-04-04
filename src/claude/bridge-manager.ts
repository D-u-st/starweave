import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { logger } from '../utils/logger';

const SESSION_NAME = 'claude-main';
const TMUX_SOCKET = process.env.TMUX_SOCKET || null; // e.g. /tmp/tmux-1000/default

function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1B\][^\x07]*\x07/g, '');
}

function tmuxArgs(...args: string[]): string[] {
  return TMUX_SOCKET ? ['-S', TMUX_SOCKET, ...args] : args;
}

// Claude Code is a full-screen TUI using the alternate screen buffer.
// capture-pane -p captures the current visible screen (correct).
// capture-pane -S - captures main scrollback only (misses TUI content).
//
// Idle state: the ❯ prompt appears alone at the bottom when Claude is ready.
// User input lines look like "❯ message content" (non-empty after ❯).
// So exact match "❯" (trimmed) = idle, "❯ foo" = user input line.
function isIdle(screen: string): boolean {
  const stripped = stripAnsi(screen);
  const lines = stripped.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return false;
  // If any spinner is visible, Claude is NOT idle
  if (lines.some(l => /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(l) || /^[•·]\s*\w+ing/i.test(l) || /^\w+ing\.{2,3}$/i.test(l))) return false;
  // Check last 5 non-empty lines for exact ❯ idle prompt
  const tail = lines.slice(-5);
  return tail.some(l => l === '❯' || l === '>');
}

export class BridgeManager extends EventEmitter {
  private monitoring: boolean = false;
  private waitingForResponse: boolean = false;
  private screenBefore: string = '';
  private sendTimestamp: number = 0;
  private lastScreenHash: string = '';
  private stableCount: number = 0;
  private readonly MIN_RESPONSE_WAIT_MS = 5000;
  private readonly STABLE_CHECKS_NEEDED = 3;

  constructor(_sessionId: string) {
    super();
  }

  async initialize(): Promise<void> {
    const check = spawn('tmux', tmuxArgs('has-session', '-t', SESSION_NAME));
    await new Promise<void>((resolve, reject) => {
      check.on('close', (code) => {
        if (code === 0) {
          logger.info(`Bridge connected to existing tmux session: ${SESSION_NAME}`);
          resolve();
        } else {
          reject(new Error(`tmux session '${SESSION_NAME}' not found. Start Claude in WSL first: tmux new-session -s claude-main && claude`));
        }
      });
    });

    this.startOutputCapture();
  }

  // Capture current visible screen - works with Claude Code's alternate screen TUI
  private captureScreen(): Promise<string> {
    return new Promise((resolve) => {
      const capture = spawn('tmux', tmuxArgs('capture-pane', '-t', SESSION_NAME, '-p'));
      let output = '';
      capture.stdout.on('data', (data) => { output += data.toString(); });
      capture.on('close', () => resolve(output));
      capture.on('error', () => resolve(''));
    });
  }

  // Walk backwards from bottom of screen, collect lines until hitting a user input line
  private extractLastClaudeResponse(screen: string): string {
    const stripped = stripAnsi(screen);
    const lines = stripped.split('\n');
    const responseLines: string[] = [];

    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      // Skip empty lines, prompt, separators
      if (!trimmed || trimmed === '❯' || trimmed.startsWith('─') || trimmed === '? for shortcuts') continue;
      // Hit user input line = stop
      if (trimmed.startsWith('❯ ')) break;
      // Skip spinners (unicode + text spinners like "Moseying...", "Thinking...", "Garnishing...")
      if (/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(trimmed)) continue;
      if (/^[•·]\s*\w+ing/i.test(trimmed)) continue; // ALL spinners: "· Moseying...", "· Fluttering...", etc.
      if (/^\w+ing\.{0,3}$/i.test(trimmed)) continue; // bare spinners without bullet: "Moseying..."
      if (/^Tip:/i.test(trimmed)) continue; // Claude Code tips
      // Skip Claude Code UI noise (status bar, hooks, update warnings, mode indicators)
      if (/UserPromptSubmit hook|Auto-update failed|bypass permissions|shift\+tab to cycle/i.test(trimmed)) continue;
      if (/^[⏵⏸◐◑◒◓]/.test(trimmed)) continue; // mode/status indicators
      if (/^\/(buddy|dream|help|compact|clear|model|cost)$/i.test(trimmed)) continue; // slash command echoes
      if (/^(Esc to cancel|Tab to amend|for shortcuts)/i.test(trimmed)) continue; // UI hints
      if (/claude doctor|npm i -g @anthropic-ai/i.test(trimmed)) continue; // update nag
      if (/^(medium|fast|slow)\s*·\s*\/effort/i.test(trimmed)) continue; // effort indicator
      if (/^\d+\s*·\s*\d+/.test(trimmed)) continue; // token/cost counters
      responseLines.unshift(trimmed.replace(/^[●✓⎿]\s*/, ''));
    }

    return responseLines.join('\n').trim();
  }

  private startOutputCapture(): void {
    this.monitoring = true;

    const interval = setInterval(async () => {
      if (!this.monitoring) {
        clearInterval(interval);
        return;
      }
      if (!this.waitingForResponse) return;
      // Don't check too early - Claude needs time to start processing
      if (Date.now() - this.sendTimestamp < this.MIN_RESPONSE_WAIT_MS) return;

      const raw = await this.captureScreen();
      const currentHash = raw.trim();

      // Track screen stability - only proceed when content stops changing
      if (currentHash === this.lastScreenHash) {
        this.stableCount++;
      } else {
        this.stableCount = 0;
        this.lastScreenHash = currentHash;
      }

      // Emit when: idle + screen changed from before send + screen stable for ~2.4s
      if (isIdle(raw) && currentHash !== this.screenBefore.trim() && this.stableCount >= this.STABLE_CHECKS_NEEDED) {
        this.waitingForResponse = false;
        const response = this.extractLastClaudeResponse(raw);
        if (response) {
          this.emit('output', response);
        }
      }
    }, 800);
  }

  async sendInput(input: string): Promise<void> {
    this.screenBefore = await this.captureScreen(); // snapshot before sending
    this.waitingForResponse = true;
    this.sendTimestamp = Date.now();
    this.lastScreenHash = '';
    this.stableCount = 0;
    await new Promise<void>((resolve, reject) => {
      const send = spawn('tmux', tmuxArgs('send-keys', '-t', SESSION_NAME, input, 'Enter'));
      send.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Failed to send to tmux: ${code}`));
      });
    });
  }

  async stop(): Promise<void> {
    const send = spawn('tmux', tmuxArgs('send-keys', '-t', SESSION_NAME, '', 'C-c'));
    await new Promise(resolve => send.on('close', resolve));
  }

  async destroy(): Promise<void> {
    this.monitoring = false;
    logger.info(`Bridge disconnected from ${SESSION_NAME} (session kept alive)`);
  }
}
