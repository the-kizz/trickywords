export type Stage = 'new' | 'learning' | 'reviewing' | 'known'

export interface WordProgress {
  wordId: string
  stage: Stage
  box: number
  /** Sessions remaining before this word is due again. */
  dueInSessions: number
  correctStreak: number
  attempts: number
  lapses: number
  struggling: boolean
  /**
   * How many times the child has read this word out loud to themselves in
   * a "Say it out loud" round and said they got it.
   *
   * A self-report from a five-year-old is not evidence, so it never
   * touches the box, the streak or the stage -- it is recorded because
   * going from letters to sound is the one thing in the app that is
   * reading rather than recognising, and a parent should be able to see
   * that it happened. There is no microphone anywhere in this app.
   */
  saidIt: number
  /**
   * How many times the child has read this word aloud to an adult who
   * confirmed they got it, in a Read it round with a grown-up present.
   *
   * Kept apart from `saidIt` because they are different evidence. A
   * five-year-old's own "I read it" is a self-report; an adult watching
   * their read a word off the screen with no sound to copy is the school's
   * own assessment -- InitiaLit-Foundation's progress monitoring is a
   * list of tricky words read aloud from print, unaided. So this one
   * *does* promote, through the ordinary ladder, while `saidIt` never
   * does. Counted here as well so a parent can see how often it has
   * happened, which a box number cannot say.
   */
  readToAdult: number
  /**
   * The calendar day this word was last promoted on (`YYYY-MM-DD`, local
   * time), or null if it never has been.
   *
   * Intervals are counted in sessions, and a session is about a minute,
   * so a word could go from never-seen to "Known solidly" inside one
   * sitting: five sessions is five minutes. This is the floor that stops
   * it -- a word is credited at most once per calendar day. It governs
   * **promotion only**; a child may practise any word as often as they
   * like, and nothing about a floored round looks or sounds different.
   *
   * `null` for a record written before this field existed, which reads
   * as "never credited" and so credits the next correct answer -- the
   * safe direction.
   */
  lastCreditedOn: string | null
}
