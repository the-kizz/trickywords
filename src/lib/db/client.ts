import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

export type Db = BetterSQLite3Database<typeof schema>

const DDL = `
CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  best_known INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS progress (
  profile_id INTEGER NOT NULL,
  word_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  box INTEGER NOT NULL,
  due_in_sessions INTEGER NOT NULL,
  correct_streak INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  lapses INTEGER NOT NULL,
  struggling INTEGER NOT NULL,
  said_it INTEGER NOT NULL DEFAULT 0,
  read_to_adult INTEGER NOT NULL DEFAULT 0,
  last_credited_on TEXT,
  PRIMARY KEY (profile_id, word_id)
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

/**
 * Columns added after the first release, applied to a database that
 * already exists. `CREATE TABLE IF NOT EXISTS` cannot add a column to a
 * table it skips, and this app ships as a single container a family
 * updates by pulling a new image -- there is nobody to run a migration
 * tool. Each entry is idempotent: the column is added only when
 * `table_info` says it is missing.
 */
const ADDED_COLUMNS: readonly { table: string; column: string; ddl: string }[] = [
  {
    table: 'profiles',
    column: 'best_known',
    ddl: 'ALTER TABLE profiles ADD COLUMN best_known INTEGER NOT NULL DEFAULT 0',
  },
  {
    table: 'progress',
    column: 'said_it',
    ddl: 'ALTER TABLE progress ADD COLUMN said_it INTEGER NOT NULL DEFAULT 0',
  },
  {
    table: 'progress',
    column: 'last_credited_on',
    ddl: 'ALTER TABLE progress ADD COLUMN last_credited_on TEXT',
  },
  {
    table: 'progress',
    column: 'read_to_adult',
    ddl: 'ALTER TABLE progress ADD COLUMN read_to_adult INTEGER NOT NULL DEFAULT 0',
  },
]

function addMissingColumns(sqlite: Database.Database): void {
  for (const { table, column, ddl } of ADDED_COLUMNS) {
    const cols = sqlite.pragma(`table_info(${table})`) as { name: string }[]
    if (!cols.some((c) => c.name === column)) sqlite.exec(ddl)
  }
}

export function getDb(
  path = process.env.TRICKYWORDS_DB ?? './data/trickywords.db',
): Db {
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.exec(DDL)
  addMissingColumns(sqlite)
  return drizzle(sqlite, { schema })
}
