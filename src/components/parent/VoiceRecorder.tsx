'use client'
import { useEffect, useRef, useState } from 'react'
import { MicrophoneIcon, PlayIcon, StopIcon, TrashIcon } from '@phosphor-icons/react'
import { MIN_TARGET_PX } from '@/lib/constants'
import type { WordSet } from '@/lib/words/types'

interface Props {
  sets: WordSet[]
}

/**
 * Records a parent's own voice for any word, via MediaRecorder, and
 * saves it to the data volume -- overriding the bundled clip in
 * gameplay from the next time the child's page loads. A familiar voice
 * is better for a child than any synthetic one.
 *
 * Microphone permission being denied (or absent, or blocked by the
 * browser) is handled as a plain message, never a crash -- recording is
 * a nice-to-have, not something the rest of the parent area depends on.
 */
export function VoiceRecorder({ sets }: Props) {
  const words = sets.flatMap((s) => s.words)
  const [wordId, setWordId] = useState(words[0]?.audioId ?? '')
  const [recorded, setRecorded] = useState<Set<string>>(new Set())
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    fetch('/api/parent/voice')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { wordIds?: string[] } | null) => {
        if (data?.wordIds) setRecorded(new Set(data.wordIds))
      })
      .catch(() => {})
  }, [])

  async function startRecording() {
    setError(null)
    setStatus(null)
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot record audio.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => { void saveRecording() }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch {
      setError('Microphone access was not allowed. Check your browser or device settings, or type in the recording area, then try again.')
    }
  }

  function stopRecording() {
    recorderRef.current?.stop()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    setRecording(false)
  }

  async function saveRecording() {
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    if (blob.size === 0) return
    try {
      const res = await fetch(`/api/parent/voice/${wordId}`, { method: 'POST', body: blob })
      if (res.ok) {
        setRecorded((prev) => new Set(prev).add(wordId))
        setStatus('Saved. This voice will play for this word from now on.')
      } else {
        setError('Could not save the recording.')
      }
    } catch {
      setError('Could not save the recording.')
    }
  }

  async function removeRecording(id: string) {
    await fetch(`/api/parent/voice/${id}`, { method: 'DELETE' }).catch(() => {})
    setRecorded((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-4 bg-card rounded-clay border-4 border-border p-5">
      <p className="text-sm text-muted-foreground leading-normal max-w-md">
        Record yourself saying a word, and your child hears you instead of the built-in
        voice for that word.
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-muted-foreground">Word</span>
        <select
          value={wordId}
          onChange={(e) => { setWordId(e.target.value); setStatus(null); setError(null) }}
          style={{ minHeight: MIN_TARGET_PX }}
          className="rounded-clay border-2 border-border px-3 max-w-xs"
        >
          {words.map((w) => (
            <option key={w.audioId} value={w.audioId}>
              {w.text}{recorded.has(w.audioId) ? ' (recorded)' : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-3">
        {!recording ? (
          <button
            type="button"
            onClick={startRecording}
            style={{ minHeight: MIN_TARGET_PX }}
            // `primary`, not `fun` pink: the pink is reserved for the
            // heart mark and progress, and a parent-area button is
            // neither.
            className="flex items-center gap-2 rounded-clay bg-primary text-on-primary font-bold px-5 cursor-pointer
              focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-fun"
          >
            <MicrophoneIcon aria-hidden="true" weight="bold" className="w-5 h-5" />
            Record
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            style={{ minHeight: MIN_TARGET_PX }}
            className="flex items-center gap-2 rounded-clay bg-primary text-on-primary font-bold px-5 cursor-pointer
              focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-fun"
          >
            <StopIcon aria-hidden="true" weight="bold" className="w-5 h-5" />
            Stop
          </button>
        )}

        {recorded.has(wordId) && (
          <>
            <button
              type="button"
              aria-label={`Play recording for ${wordId}`}
              onClick={() => new Audio(`/api/parent/voice/${wordId}`).play().catch(() => {})}
              style={{ minWidth: MIN_TARGET_PX, minHeight: MIN_TARGET_PX }}
              className="flex items-center justify-center rounded-clay border-2 border-border cursor-pointer"
            >
              <PlayIcon aria-hidden="true" weight="bold" className="w-5 h-5" />
            </button>
            <button
              type="button"
              aria-label={`Delete recording for ${wordId}`}
              onClick={() => removeRecording(wordId)}
              style={{ minWidth: MIN_TARGET_PX, minHeight: MIN_TARGET_PX }}
              className="flex items-center justify-center rounded-clay border-2 border-border text-red-600 cursor-pointer"
            >
              <TrashIcon aria-hidden="true" weight="bold" className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {error && <p role="alert" className="text-sm font-semibold text-red-600 max-w-md leading-normal">{error}</p>}
      {status && <p role="status" className="text-sm font-semibold">{status}</p>}

      {recorded.size > 0 && (
        <div>
          <p className="text-sm font-semibold text-muted-foreground mb-1">Recorded words</p>
          <p className="text-sm text-muted-foreground">
            {words.filter((w) => recorded.has(w.audioId)).map((w) => w.text).join(', ')}
          </p>
        </div>
      )}
    </div>
  )
}
