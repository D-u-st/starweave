import { Collection } from 'discord.js';
import { Session } from './session';
import { logger } from '../utils/logger';
import { config } from '../config';
import Database from 'sqlite3';
import path from 'path';
import fs from 'fs';

export class SessionManager {
  private sessions: Collection<string, Session>;
  private db: Database.Database | null = null;
  private channelSessionMap: Map<string, string>;

  constructor() {
    this.sessions = new Collection();
    this.channelSessionMap = new Map();
  }

  async initialize(): Promise<void> {
    await this.initializeDatabase();
    await this.loadPersistedSessions();
  }

  private async initializeDatabase(): Promise<void> {
    const dbPath = path.resolve(config.database.path);
    const dbDir = path.dirname(dbPath);

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      this.db = new Database.Database(dbPath, (err) => {
        if (err) {
          logger.error('Failed to open database:', err);
          reject(err);
          return;
        }

        this.db!.run(`
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
        `, (err) => {
          if (err) {
            logger.error('Failed to create sessions table:', err);
            reject(err);
          } else {
            logger.info('Database initialized');
            resolve();
          }
        });
      });
    });
  }

  private async loadPersistedSessions(): Promise<void> {
    if (!this.db || !config.features.persistence) return;

    return new Promise((resolve) => {
      this.db!.all(
        'SELECT * FROM sessions WHERE status = ?',
        ['active'],
        (err, rows: any[]) => {
          if (err) {
            logger.error('Failed to load sessions:', err);
            resolve();
            return;
          }

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
          resolve();
        }
      );
    });
  }

  async createSession(userId: string, channelId: string): Promise<Session> {
    const sessionId = this.generateSessionId();
    const session = new Session(sessionId, userId, channelId);

    this.sessions.set(sessionId, session);
    this.channelSessionMap.set(channelId, sessionId);

    await session.initialize();
    await this.persistSession(session);

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
      await this.deletePersistedSession(sessionId);
    }
  }

  async restoreSession(channelId: string): Promise<Session | null> {
    if (!this.db) return null;

    return new Promise((resolve) => {
      this.db!.get(
        'SELECT * FROM sessions WHERE channel_id = ? ORDER BY updated_at DESC LIMIT 1',
        [channelId],
        (err, row: any) => {
          if (err || !row) {
            resolve(null);
            return;
          }
          try {
            const sessionData = JSON.parse(row.data || '{}');
            const session = new Session(row.id, row.user_id, row.channel_id);
            session.restore(sessionData);
            this.sessions.set(row.id, session);
            this.channelSessionMap.set(row.channel_id, row.id);
            resolve(session);
          } catch {
            resolve(null);
          }
        }
      );
    });
  }

  async saveAllSessions(): Promise<void> {
    const promises = Array.from(this.sessions.values()).map(session =>
      this.persistSession(session)
    );
    await Promise.all(promises);
    logger.info('All sessions saved');
  }

  private async persistSession(session: Session): Promise<void> {
    if (!this.db || !config.features.persistence) return;

    const data = session.serialize();

    return new Promise((resolve, reject) => {
      this.db!.run(
        `INSERT OR REPLACE INTO sessions (id, user_id, channel_id, status, model, created_at, updated_at, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.id,
          session.userId,
          session.channelId,
          session.status,
          session.model,
          session.createdAt,
          Date.now(),
          JSON.stringify(data)
        ],
        (err) => {
          if (err) {
            logger.error(`Failed to persist session ${session.id}:`, err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  private async deletePersistedSession(sessionId: string): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve) => {
      this.db!.run('DELETE FROM sessions WHERE id = ?', [sessionId], (err) => {
        if (err) {
          logger.error(`Failed to delete session ${sessionId}:`, err);
        }
        resolve();
      });
    });
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
