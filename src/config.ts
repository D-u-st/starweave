// dotenv is loaded in index.ts before this module is imported

interface Config {
  discord: {
    token: string;
    clientId: string;
    guildId?: string;
    allowedUserIds: string[];
  };
  claude: {
    cliPath: string;
    sessionType: 'bridge' | 'tmux' | 'pty';
  };
  features: {
    streaming: boolean;
    threading: boolean;
    persistence: boolean;
  };
  database: {
    path: string;
  };
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function parseBoolean(value: string | undefined, defaultValue: boolean = false): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

export const config: Config = {
  discord: {
    token: process.env.DISCORD_TOKEN || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
    guildId: process.env.DISCORD_GUILD_ID,
    allowedUserIds: parseList(process.env.ALLOWED_USER_IDS)
  },
  claude: {
    cliPath: process.env.CLAUDE_CLI_PATH || 'claude',
    sessionType: (process.env.SESSION_TYPE as 'bridge' | 'tmux' | 'pty') || 'bridge'
  },
  features: {
    streaming: parseBoolean(process.env.ENABLE_STREAMING, true),
    threading: parseBoolean(process.env.ENABLE_THREADING, true),
    persistence: parseBoolean(process.env.ENABLE_PERSISTENCE, true)
  },
  database: {
    path: process.env.DATABASE_PATH || './data/sessions.db'
  }
};

export function validateConfig(): boolean {
  if (!config.discord.token) {
    console.error('DISCORD_TOKEN is required');
    return false;
  }
  if (!config.discord.clientId) {
    console.error('DISCORD_CLIENT_ID is required');
    return false;
  }
  return true;
}
