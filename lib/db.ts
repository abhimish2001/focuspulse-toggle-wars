import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const DB_FILE = process.env.DATABASE_PATH || path.join(process.cwd(), 'focuspulse.db');

let dbInstance: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (!dbInstance) {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    dbInstance = new DatabaseSync(DB_FILE);
    dbInstance.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;

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
  const ts = data.timestamp || new Date().toISOString();

  const insert = db.prepare(`
    INSERT OR IGNORE INTO events (event_id, user_id, variant, event_name, timestamp, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const result = insert.run(
    data.event_id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    data.user_id,
    data.variant || 'minimal',
    data.event_name,
    ts,
    metaStr
  );

  return { inserted: Number(result.changes) > 0 };
}

export function getExperimentStats(excludeNoise: boolean = true, includeDemo: boolean = true) {
  const db = getDb();

  const noiseFlag = excludeNoise ? 1 : 0;
  const demoFlag = includeDemo ? 1 : 0;

  // Exclude short (<10s) abandoned sessions and their corresponding session_started events when noise filter is enabled
  const rows = db.prepare(`
    WITH noisy_sessions AS (
      SELECT DISTINCT json_extract(metadata, '$.session_uuid') AS sid
      FROM events
      WHERE event_name = 'session_abandoned'
        AND json_valid(metadata) = 1
        AND json_extract(metadata, '$.session_uuid') IS NOT NULL
        AND (
          CAST(json_extract(metadata, '$.elapsed_seconds') AS REAL) < 10
          OR json_extract(metadata, '$.is_noise') = 1
        )
    ),
    filtered_events AS (
      SELECT *
      FROM events
      WHERE variant IN ('minimal', 'gamified')
        AND (
          ? = 1
          OR json_valid(metadata) = 0
          OR COALESCE(json_extract(metadata, '$.is_demo_mode'), 0) != 1
        )
        AND (
          ? = 0
          OR NOT (
            event_name = 'session_abandoned'
            AND json_valid(metadata) = 1
            AND (
              CAST(json_extract(metadata, '$.elapsed_seconds') AS REAL) < 10
              OR json_extract(metadata, '$.is_noise') = 1
            )
          )
        )
        AND (
          ? = 0
          OR json_valid(metadata) = 0
          OR json_extract(metadata, '$.session_uuid') IS NULL
          OR json_extract(metadata, '$.session_uuid') NOT IN (SELECT sid FROM noisy_sessions)
        )
    )
    SELECT 
      variant,
      COUNT(DISTINCT CASE WHEN event_name = 'experiment_exposed' THEN user_id END) as exposed_users,
      COUNT(CASE WHEN event_name = 'session_started' THEN 1 END) as sessions_started,
      COUNT(CASE WHEN event_name = 'session_abandoned' THEN 1 END) as sessions_abandoned,
      COUNT(CASE WHEN event_name = 'session_completed' THEN 1 END) as sessions_completed
    FROM filtered_events
    GROUP BY variant
  `).all(demoFlag, noiseFlag, noiseFlag) as any[];

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

  // Calculate relative statistical lift
  let lift = 0;
  if (summary.minimal.completion_rate > 0) {
    lift = Number((((summary.gamified.completion_rate - summary.minimal.completion_rate) / summary.minimal.completion_rate) * 100).toFixed(1));
  } else if (summary.gamified.completion_rate > 0) {
    lift = 100;
  }

  // Count excluded noise events for transparency
  const noiseCountRow = db.prepare(`
    SELECT COUNT(*) as cnt
    FROM events
    WHERE event_name = 'session_abandoned'
      AND json_valid(metadata) = 1
      AND (
        CAST(json_extract(metadata, '$.elapsed_seconds') AS REAL) < 10
        OR json_extract(metadata, '$.is_noise') = 1
      )
  `).get() as any;

  // Get recent 15 events
  const recentEvents = db.prepare(`
    SELECT event_id, user_id, variant, event_name, timestamp, metadata
    FROM events
    WHERE (
      ? = 1
      OR json_valid(metadata) = 0
      OR COALESCE(json_extract(metadata, '$.is_demo_mode'), 0) != 1
    )
    ORDER BY id DESC
    LIMIT 15
  `).all(demoFlag) as any[];

  return {
    summary,
    lift,
    recentEvents,
    noiseFiltered: excludeNoise,
    includeDemo,
    excludedNoiseCount: Number(noiseCountRow?.cnt || 0)
  };
}

export function getAllEventsForExport() {
  const db = getDb();
  return db.prepare(`
    SELECT id, event_id, user_id, variant, event_name, timestamp, metadata
    FROM events
    ORDER BY id ASC
  `).all() as any[];
}

export function resetDatabase() {
  const db = getDb();
  db.exec(`DELETE FROM events;`);
}
