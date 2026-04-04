import { Session } from './session';
import { logger } from '../utils/logger';
import { config } from '../config';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export class SessionManager {
  private sessions: Map<string, Session>;
  private db: Database.Database | null = null;
  private channelSessionMap: Map<string, string>;

  constructor() {
    this.sessions = new Map();
    this.channelSessionMap = new Map();
  }

  async initialize(): Promise<void> {
    this.initializeDatabase();
    this.loadPersistedSessions();
  }

  private initializeDatabase(): void {
    const dbPath = path.resolve(config.database.path);
    const dbDir = path.dirname(dbPath);

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    try {
      this.db = new Database(dbPath);

      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          status TEXT NOT NULL,
          model TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          data TEXT
        )
      `).run();

      logger.info('Database initialized');
    } catch (err) {
      logger.error('Failed to initialize database:', err);
      throw err;
    }
  }

  private loadPersistedSessions(): void {
    if (!this.db || !config.features.persistence) return;

    try {
      const rows = this.db.prepare(
        'SELECT * FROM sessions WHERE status = ?'
      ).all('active') as any[];

      rows.forEach(row => {
        try {
          const sessionData = JSON.parse(row.data || '{}');
          const session = new Session(row.id, row.user_id, row.channel_id);
          session.restore(sessionData);
          this.sessions.set(row.id, session);
          this.channelSessionMap.set(row.channel_id, row.id);
          logger.info(`Restored session: ${row.id}`);
        } catch (error) {
          logger.error(`Failed to restore session ${row.id}:`, error);
        }
      });

      logger.info(`Restored ${rows.length} sessions`);
    } catch (err) {
      logger.error('Failed to load sessions:', err);
    }
  }

  async createSession(userId: string, channelId: string): Promise<Session> {
    const sessionId = this.generateSessionId();
    const session = new Session(sessionId, userId, channelId);

    this.sessions.set(sessionId, session);
    this.channelSessionMap.set(channelId, sessionId);

    await session.initialize();
    this.persistSession(session);

    logger.info(`Created session: ${sessionId} for user: ${userId}`);
    return session;
  }

  async getOrCreateSession(userId: string, channelId: string): Promise<Session> {
    const existingSessionId = this.channelSessionMap.get(channelId);
    if (existingSessionId) {
      const session = this.sessions.get(existingSessionId);
      if (session && session.status !== 'stopped') {
        return session;
      }
    }
    return this.createSession(userId, channelId);
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionByChannel(channelId: string): Session | undefined {
    const sessionId = this.channelSessionMap.get(channelId);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.destroy();
      this.sessions.delete(sessionId);
      this.channelSessionMap.delete(session.channelId);
      this.deletePersistedSession(sessionId);
    }
  }

  restoreSession(channelId: string): Session | null {
    if (!this.db) return null;

    try {
      const row = this.db.prepare(
        'SELECT * FROM sessions WHERE channel_id = ? ORDER BY updated_at DESC LIMIT 1'
      ).get(channelId) as any;

      if (!row) return null;

      const sessionData = JSON.parse(row.data || '{}');
      const session = new Session(row.id, row.user_id, row.channel_id);
      session.restore(sessionData);
      this.sessions.set(row.id, session);
      this.channelSessionMap.set(row.channel_id, row.id);
      return session;
    } catch {
      return null;
    }
  }

  saveAllSessions(): void {
    for (const session of this.sessions.values()) {
      this.persistSession(session);
    }
    logger.info('All sessions saved');
  }

  private persistSession(session: Session): void {
    if (!this.db || !config.features.persistence) return;

    const data = session.serialize();

    try {
      this.db.prepare(
        `INSERT OR REPLACE INTO sessions (id, user_id, channel_id, status, model, created_at, updated_at, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        session.id,
        session.userId,
        session.channelId,
        session.status,
        session.model,
        session.createdAt,
        Date.now(),
        JSON.stringify(data)
      );
    } catch (err) {
      logger.error(`Failed to persist session ${session.id}:`, err);
    }
  }

  private deletePersistedSession(sessionId: string): void {
    if (!this.db) return;

    try {
      this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    } catch (err) {
      logger.error(`Failed to delete session ${sessionId}:`, err);
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
