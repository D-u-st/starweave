import * as dotenv from 'dotenv';
dotenv.config();

import { ProxyAgent, setGlobalDispatcher } from 'undici';

if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY!;
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

import { Client, GatewayIntentBits, Events, Message, TextChannel } from 'discord.js';
import { SessionManager } from './claude/session-manager';
import { logger } from './utils/logger';
import { config, validateConfig } from './config';

if (!validateConfig()) {
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

const sessionManager = new SessionManager();

// Split long responses into <=2000 char chunks
function splitMessage(text: string, maxLen = 2000): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + maxLen));
    start += maxLen;
  }
  return chunks;
}

client.once(Events.ClientReady, async (readyClient) => {
  logger.info(`Logged in as ${readyClient.user.tag}`);
  await sessionManager.initialize();
  logger.info('SessionManager initialized');
});

client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return;

  // Only respond when mentioned
  if (!message.mentions.has(client.user!)) return;

  // Authorization check
  const allowedUsers = config.discord.allowedUserIds;
  if (allowedUsers.length > 0 && !allowedUsers.includes(message.author.id)) {
    await message.reply('You are not authorized to use this bot.');
    return;
  }

  const content = message.content.replace(/<@!?\d+>/g, '').trim();
  if (!content) return;

  const channel = message.channel as TextChannel;

  try {
    // Get or create session for this channel
    const session = await sessionManager.getOrCreateSession(
      message.author.id,
      message.channelId
    );

    // Show typing while waiting
    await channel.sendTyping();

    // One-shot listener: capture next output event from this session
    const responsePromise = new Promise<{ type: string; content: string }>((resolve) => {
      session.once('output', (type: string, content: string) => {
        resolve({ type, content });
      });
    });

    // Send message to Claude
    await session.sendMessage(content);

    // Wait for response (with timeout)
    const timeoutMs = 120_000;
    const result = await Promise.race([
      responsePromise,
      new Promise<{ type: string; content: string }>((_, reject) =>
        setTimeout(() => reject(new Error('Response timeout')), timeoutMs)
      )
    ]);

    const chunks = splitMessage(result.content);
    for (const chunk of chunks) {
      await channel.send(chunk);
    }

  } catch (error: any) {
    logger.error('Error handling message:', error);
    await channel.send(`Error: ${error.message}`);
  }
});

process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  await sessionManager.saveAllSessions();
  await client.destroy();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
});

client.login(config.discord.token).catch((error) => {
  logger.error('Failed to login:', error);
  process.exit(1);
});
