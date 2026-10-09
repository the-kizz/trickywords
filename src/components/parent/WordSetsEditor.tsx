'use client'
import { useState } from 'react'
import {
  ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon,
} from '@phosphor-icons/react'
import { MIN_TARGET_PX } from '@/lib/constants'
import type { WordSet, Word, Classification } from '@/lib/words/types'

interface Props {
  initialSets: WordSet[]
  onSaved: () => void
}

const CLASSIFICATIONS: Classification[] = ['heart', 'decodable', 'family']

function nextSetId(sets: WordSet[]): number {
  return sets.reduce((max, s) => Math.max(max, s.id), 0) + 1
}

function wordIdFor(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'word'
}

function blankWord(): Word {
  return {
    id: '', text: '', graphemes: [''], phonemes: [''],
    trickyIndices: [], classification: 'heart', sentences: [''], audioId: '',
  }
}

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr
  const next = [...arr]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * Lets a parent reshape the word sets the app teaches from: the
 * bundled defaults are the sequence a school typically sends home, but
 * a different school sends a different one, so every part of this is
 * editable, not just the words within a fixed set of sets.
 *
 * Deliberately keeps the phonics metadata (graphemes/phonemes/tricky
 * letters) as plain, editable text rather than a bespoke picker -- a
 * parent adding "friend" needs to be able to mark the "ie" as tricky
 * without learning a new UI, and comma-separated segments do that with
 * a one-line hint.
 */
export function WordSetsEditor({ initialSets, onSaved }: Props) {
  const [sets, setSets] = useState<WordSet[]>(initialSets)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  function updateSet(index: number, patch: Partial<WordSet>) {
    setSets((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  function updateWord(setIndex: number, wordIndex: number, patch: Partial<Word>) {
    setSets((prev) =>
      prev.map((s, i) =>
        i !== setIndex ? s : { ...s, words: s.words.map((w, j) => (j === wordIndex ? { ...w, ...patch } : w)) },
      ),
    )
  }

  function addSet() {
    setSets((prev) => [...prev, { id: nextSetId(prev), name: `Set ${prev.length + 1}`, words: [] }])
  }

  function deleteSet(index: number) {
    if (!window.confirm('Delete this whole set?')) return
    setSets((prev) => prev.filter((_, i) => i !== index))
  }

  function moveSet(index: number, dir: -1 | 1) {
    setSets((prev) => move(prev, index, index + dir))
  }

  function addWord(setIndex: number) {
    setSets((prev) =>
      prev.map((s, i) => (i !== setIndex ? s : { ...s, words: [...s.words, blankWord()] })),
    )
  }

  function deleteWord(setIndex: number, wordIndex: number) {
    setSets((prev) =>
      prev.map((s, i) => (i !== setIndex ? s : { ...s, words: s.words.filter((_, j) => j !== wordIndex) })),
    )
  }

  function moveWord(setIndex: number, wordIndex: number, dir: -1 | 1) {
    setSets((prev) =>
      prev.map((s, i) => (i !== setIndex ? s : { ...s, words: move(s.words, wordIndex, wordIndex + dir) })),
    )
  }

  async function handleSave() {
    setError(null)
    setSavedMessage(null)

    // Fill in the derived fields (id, audioId, graphemes/phonemes as
    // arrays) from the plain-text form just before saving, and drop any
    // word a parent left blank or any set left with no words -- an
    // empty set can never teach anything.
    const cleaned: WordSet[] = sets
      .map((s) => ({
        ...s,
        words: s.words
          .filter((w) => w.text.trim().length > 0)
          .map((w) => {
            const graphemes = (Array.isArray(w.graphemes) ? w.graphemes : [])
              .join(',').split(',').map((g) => g.trim()).filter(Boolean)
            const id = wordIdFor(w.text)
            return {
              ...w,
              id,
              audioId: id,
              text: w.text.trim(),
              graphemes: graphemes.length > 0 ? graphemes : [w.text.trim()],
              phonemes: graphemes.length > 0 ? graphemes : [w.text.trim()],
              sentences: w.sentences.filter((sentence) => sentence.trim().length > 0).length > 0
                ? w.sentences.filter((sentence) => sentence.trim().length > 0)
                : [`I can read ${w.text.trim()}.`],
            }
          }),
      }))
      .filter((s) => s.words.length > 0)

    if (cleaned.length === 0) {
      setError('At least one set with at least one word is required.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/parent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-sets', sets: cleaned }),
      })
      if (res.ok) {
        setSets(cleaned)
        setSavedMessage('Word sets saved.')
        onSaved()
      } else {
        setError('Could not save -- check every word has text and a sentence.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {sets.map((set, si) => (
        /*
         * Closed by default, and one `<details>` per set.
         *
         * Every set expanded with every word's four fields made this
         * tab 23,132px tall on a 390px phone -- twelve sets of fifty-six
         * words, none of which a parent is usually editing. The
         * `<summary>` is a full child-sized target so it can be opened
         * one-handed.
         */
        <details key={si} className="bg-card rounded-clay border-4 border-border">
          <summary
            style={{ minHeight: MIN_TARGET_PX }}
            className="flex items-center px-5 font-display font-bold cursor-pointer select-none"
          >
            {set.name} -- {set.words.length} {set.words.length === 1 ? 'word' : 'words'}
          </summary>

          <div className="flex flex-col gap-3 p-5 pt-3">
          {/*
            Wraps rather than overflowing: at 390 wide the name field
            plus three 76px buttons ran to x 502, so "Move set down" and
            "Delete" sat off the side of the screen and the page
            scrolled horizontally.
          */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={set.name}
              onChange={(e) => updateSet(si, { name: e.target.value })}
              aria-label="Set name"
              style={{ minHeight: MIN_TARGET_PX }}
              className="w-full sm:flex-1 sm:w-auto min-w-0 rounded-clay border-2 border-border px-3 font-display font-bold"
            />
            <button type="button" aria-label="Move set up" onClick={() => moveSet(si, -1)}
              disabled={si === 0}
              style={{ minWidth: MIN_TARGET_PX, minHeight: MIN_TARGET_PX }}
              className="flex items-center justify-center rounded-clay border-2 border-border disabled:opacity-30 cursor-pointer">
              <ArrowUpIcon aria-hidden="true" weight="bold" className="w-5 h-5" />
            </button>
            <button type="button" aria-label="Move set down" onClick={() => moveSet(si, 1)}
              disabled={si === sets.length - 1}
              style={{ minWidth: MIN_TARGET_PX, minHeight: MIN_TARGET_PX }}
              className="flex items-center justify-center rounded-clay border-2 border-border disabled:opacity-30 cursor-pointer">
              <ArrowDownIcon aria-hidden="true" weight="bold" className="w-5 h-5" />
            </button>
            <button type="button" aria-label={`Delete ${set.name}`} onClick={() => deleteSet(si)}
              style={{ minWidth: MIN_TARGET_PX, minHeight: MIN_TARGET_PX }}
              className="flex items-center justify-center rounded-clay border-2 border-border text-red-600 cursor-pointer">
              <TrashIcon aria-hidden="true" weight="bold" className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {set.words.map((word, wi) => (
              /*
                One field per row on a phone, a single row from `sm`
                up. The fixed 8rem/10rem/12rem widths below are the
                `sm:` case only -- at 390 they forced the row wider
                than the viewport.
              */
              <div key={wi} className="flex flex-wrap items-center gap-2 rounded-clay border-2 border-border p-2">
                <input
                  value={word.text}
                  onChange={(e) => updateWord(si, wi, { text: e.target.value })}
                  aria-label="Word"
                  placeholder="word"
                  style={{ minHeight: MIN_TARGET_PX }}
                  className="w-full sm:w-32 min-w-0 font-word font-bold rounded-clay border-2 border-border px-2"
                />
                <select
                  value={word.classification}
                  onChange={(e) => updateWord(si, wi, { classification: e.target.value as Classification })}
                  aria-label="Word type"
                  style={{ minHeight: MIN_TARGET_PX }}
                  className="w-full sm:w-auto rounded-clay border-2 border-border px-2"
                >
                  {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                  value={word.graphemes.join(',')}
                  onChange={(e) => updateWord(si, wi, { graphemes: e.target.value.split(',') })}
                  aria-label="Tricky letters, comma separated"
                  placeholder="letter chunks, e.g. th,e"
                  style={{ minHeight: MIN_TARGET_PX }}
                  className="w-full sm:w-40 min-w-0 rounded-clay border-2 border-border px-2 text-sm"
                />
                <input
                  value={word.sentences[0] ?? ''}
                  onChange={(e) => updateWord(si, wi, { sentences: [e.target.value] })}
                  aria-label="Example sentence"
                  placeholder="example sentence"
                  style={{ minHeight: MIN_TARGET_PX }}
                  className="w-full sm:flex-1 sm:min-w-48 min-w-0 rounded-clay border-2 border-border px-2 text-sm"
                />
                <button type="button" aria-label="Move word up" onClick={() => moveWord(si, wi, -1)}
                  disabled={wi === 0}
                  style={{ minWidth: MIN_TARGET_PX, minHeight: MIN_TARGET_PX }}
                  className="flex items-center justify-center rounded-clay border-2 border-border disabled:opacity-30 cursor-pointer">
                  <ArrowUpIcon aria-hidden="true" weight="bold" className="w-4 h-4" />
                </button>
                <button type="button" aria-label="Move word down" onClick={() => moveWord(si, wi, 1)}
                  disabled={wi === set.words.length - 1}
                  style={{ minWidth: MIN_TARGET_PX, minHeight: MIN_TARGET_PX }}
                  className="flex items-center justify-center rounded-clay border-2 border-border disabled:opacity-30 cursor-pointer">
                  <ArrowDownIcon aria-hidden="true" weight="bold" className="w-4 h-4" />
                </button>
                <button type="button" aria-label={`Delete ${word.text || 'this word'}`} onClick={() => deleteWord(si, wi)}
                  style={{ minWidth: MIN_TARGET_PX, minHeight: MIN_TARGET_PX }}
                  className="flex items-center justify-center rounded-clay border-2 border-border text-red-600 cursor-pointer">
                  <TrashIcon aria-hidden="true" weight="bold" className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => addWord(si)}
            style={{ minHeight: MIN_TARGET_PX }}
            className="flex items-center justify-center gap-2 rounded-clay border-2 border-dashed border-border
              text-muted-foreground font-semibold cursor-pointer self-start px-4"
          >
            <PlusIcon aria-hidden="true" weight="bold" className="w-4 h-4" />
            Add word
          </button>
          </div>
        </details>
      ))}

      <button
        type="button"
        onClick={addSet}
        style={{ minHeight: MIN_TARGET_PX }}
        className="flex items-center justify-center gap-2 rounded-clay border-2 border-dashed border-border
          text-muted-foreground font-semibold cursor-pointer px-4"
      >
        <PlusIcon aria-hidden="true" weight="bold" className="w-5 h-5" />
        Add set
      </button>

      {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
      {savedMessage && <p role="status" className="text-sm font-semibold">{savedMessage}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        style={{ minHeight: MIN_TARGET_PX }}
        className="rounded-clay bg-primary text-on-primary font-bold text-lg cursor-pointer disabled:opacity-40
          focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-fun"
      >
        Save word sets
      </button>
    </div>
  )
}
