import { EventEmitter } from 'events';
import { BridgeManager } from './bridge-manager';
import { OutputParser } from './output-parser';
import { logger } from '../utils/logger';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  id: string;
}

export class Session extends EventEmitter {
  public readonly id: string;
  public readonly userId: string;
  public readonly channelId: string;
  public readonly createdAt: number;

  public status: 'active' | 'idle' | 'stopped' = 'active';
  public model: string = 'default';
  public messageCount: number = 0;

  private messages: ClaudeMessage[] = [];
  private processManager: BridgeManager | null = null;
  private outputParser: OutputParser;
  private lastActivity: number;

  constructor(id: string, userId: string, channelId: string) {
    super();
    this.id = id;
    this.userId = userId;
    this.channelId = channelId;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.outputParser = new OutputParser();
  }

  async initialize(): Promise<void> {
    try {
      this.processManager = new BridgeManager(this.id);
      await this.processManager.initialize();

      this.processManager.on('output', (data: string) => {
        const parsed = this.outputParser.parse(data);
        const msg: ClaudeMessage = {
          role: 'assistant',
          content: parsed.content,
          timestamp: Date.now(),
          id: this.generateMessageId()
        };
        this.messages.push(msg);
        this.emit('output', parsed.type, parsed.content);
      });

      this.processManager.on('error', (error: Error) => {
        logger.error(`Session ${this.id} process error:`, error);
        this.emit('error', error);
      });

      logger.info(`Session ${this.id} initialized (bridge mode)`);
    } catch (error) {
      logger.error(`Failed to initialize session ${this.id}:`, error);
      throw error;
    }
  }

  async sendMessage(content: string): Promise<void> {
    this.lastActivity = Date.now();

    const message: ClaudeMessage = {
      role: 'user',
      content,
      timestamp: Date.now(),
      id: this.generateMessageId()
    };

    this.messages.push(message);
    this.messageCount++;

    if (this.processManager) {
      await this.processManager.sendInput(content);
    }

    logger.info(`Session ${this.id}: user message sent`);
  }

  getInfo(): object {
    return {
      id: this.id,
      userId: this.userId,
      channelId: this.channelId,
      status: this.status,
      messageCount: this.messageCount,
      createdAt: new Date(this.createdAt).toISOString(),
      lastActivity: new Date(this.lastActivity).toISOString()
    };
  }

  async destroy(): Promise<void> {
    if (this.processManager) {
      await this.processManager.destroy();
      this.processManager = null;
    }
    this.status = 'stopped';
    logger.info(`Session ${this.id} destroyed`);
  }

  serialize(): object {
    return {
      messages: this.messages,
      messageCount: this.messageCount,
      model: this.model,
      status: this.status,
      lastActivity: this.lastActivity
    };
  }

  restore(data: any): void {
    this.messages = data.messages || [];
    this.messageCount = data.messageCount || 0;
    this.model = data.model || 'default';
    this.status = data.status || 'idle';
    this.lastActivity = data.lastActivity || Date.now();
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
