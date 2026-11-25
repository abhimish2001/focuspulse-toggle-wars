import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const DB_FILE = process.env.DATABASE_PATH || path.join(process.cwd(), 'focuspulse.db');

let dbInstance: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(DB_FILE);
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT UNIQUE NOT NULL,
        user_id TEXT NOT NULL,
        variant TEXT NOT NULL,
        event_name TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_user_id ON events (user_id);
      CREATE INDEX IF NOT EXISTS idx_event_name ON events (event_name);
      CREATE INDEX IF NOT EXISTS idx_variant ON events (variant);
    `);
  }
  return dbInstance;
}

export interface EventRecord {
  event_id: string;
  user_id: string;
  variant: 'minimal' | 'gamified' | string;
  event_name: 'experiment_exposed' | 'session_started' | 'session_abandoned' | 'session_completed' | string;
  timestamp?: string;
  metadata?: Record<string, any> | string;
}

export function logEvent(data: EventRecord) {
  const db = getDb();
  const metaStr = typeof data.metadata === 'object' ? JSON.stringify(data.metadata) : (data.metadata || null);

  const insert = db.prepare(`
    INSERT INTO events (event_id, user_id, variant, event_name, metadata)
    VALUES (?, ?, ?, ?, ?)
  `);

  insert.run(
    data.event_id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    data.user_id,
    data.variant || 'minimal',
    data.event_name,
    metaStr
  );
}

export function getExperimentStats() {
  const db = getDb();

  // Aggregate stats per variant
  const rows = db.prepare(`
    SELECT 
      variant,
      COUNT(DISTINCT CASE WHEN event_name = 'experiment_exposed' THEN user_id END) as exposed_users,
      COUNT(CASE WHEN event_name = 'session_started' THEN 1 END) as sessions_started,
      COUNT(CASE WHEN event_name = 'session_abandoned' THEN 1 END) as sessions_abandoned,
      COUNT(CASE WHEN event_name = 'session_completed' THEN 1 END) as sessions_completed
    FROM events
    WHERE variant IN ('minimal', 'gamified')
    GROUP BY variant
  `).all() as any[];

  const summary = {
    minimal: { exposed_users: 0, sessions_started: 0, sessions_abandoned: 0, sessions_completed: 0, completion_rate: 0 },
    gamified: { exposed_users: 0, sessions_started: 0, sessions_abandoned: 0, sessions_completed: 0, completion_rate: 0 }
  };

  rows.forEach(r => {
    const v = r.variant as 'minimal' | 'gamified';
    if (summary[v]) {
      summary[v].exposed_users = Number(r.exposed_users) || 0;
      summary[v].sessions_started = Number(r.sessions_started) || 0;
      summary[v].sessions_abandoned = Number(r.sessions_abandoned) || 0;
      summary[v].sessions_completed = Number(r.sessions_completed) || 0;
      summary[v].completion_rate = summary[v].sessions_started > 0
        ? Number(((summary[v].sessions_completed / summary[v].sessions_started) * 100).toFixed(1))
        : 0;
    }
  });

  // Calculate lift
  let lift = 0;
  if (summary.minimal.completion_rate > 0) {
    lift = Number((((summary.gamified.completion_rate - summary.minimal.completion_rate) / summary.minimal.completion_rate) * 100).toFixed(1));
  } else if (summary.gamified.completion_rate > 0) {
    lift = 100;
  }

  // Get recent 15 events
  const recentEvents = db.prepare(`
    SELECT event_id, user_id, variant, event_name, timestamp, metadata
    FROM events
    ORDER BY id DESC
    LIMIT 15
  `).all() as any[];

  return {
    summary,
    lift,
    recentEvents
  };
}

export function resetDatabase() {
  const db = getDb();
  db.exec(`DELETE FROM events;`);
}
