import { sqliteTable, integer, text, primaryKey } from 'drizzle-orm/sqlite-core'

export const profiles = sqliteTable('profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  avatar: text('avatar').notNull(),
  createdAt: integer('created_at').notNull(),
  /**
   * The high-water mark of words this child has ever known at once --
   * what the companion and the sticker book are drawn from. See
   * `highWaterKnown`. Only ever rises.
   */
  bestKnown: integer('best_known').notNull().default(0),
})

export const progress = sqliteTable('progress', {
  profileId: integer('profile_id').notNull(),
  wordId: text('word_id').notNull(),
  stage: text('stage').notNull(),
  box: integer('box').notNull(),
  dueInSessions: integer('due_in_sessions').notNull(),
  correctStreak: integer('correct_streak').notNull(),
  attempts: integer('attempts').notNull(),
  lapses: integer('lapses').notNull(),
  struggling: integer('struggling').notNull(),
  /** Times the child has read this word out loud -- see `recordSaidIt`. */
  saidIt: integer('said_it').notNull().default(0),
  /** Times an adult confirmed they read it -- see `recordReadToAdult`. */
  readToAdult: integer('read_to_adult').notNull().default(0),
  /**
   * The calendar day this word was last promoted on, or null. The day
   * floor on credit -- see `recordCorrect`.
   */
  lastCreditedOn: text('last_credited_on'),
}, (t) => ({ pk: primaryKey({ columns: [t.profileId, t.wordId] }) }))

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})
