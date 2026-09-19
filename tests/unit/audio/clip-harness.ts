import { vi } from 'vitest'
import { clipDurationMs } from '@/lib/audio/player'

/**
 * Makes jsdom's media element behave like a real one for the single thing
 * the audio queue depends on: reporting that a clip has finished.
 *
 * jsdom fires neither `playing` nor `ended`, so without this the queue
 * only ever advances via its safety-net timeout and a test aiming at the
 * real path would be exercising the net instead. The double ends each
 * clip after the clip's own measured length, which is what a browser
 * does -- and it is why the queue waits on the event rather than on a
 * timer started at `play()`: a clip finishes later than its file length
 * says, because the delay before sound starts pushes its end out too.
 *
 * `onPlay` is called with each src as it starts. It is a callback rather
 * than a returned array so that a test may reassign its own collector
 * mid-test (to measure "what was said from here on") and still be heard.
 */
export function installClipHarness(onPlay: (src: string) => void): void {
  window.HTMLMediaElement.prototype.play = vi.fn(function play(this: HTMLMediaElement) {
    const element = this
    onPlay(element.src)
    let path = element.src
    try {
      path = new URL(element.src, 'http://localhost').pathname
    } catch {
      // Leave it as-is; an unmeasurable src falls back to UNKNOWN_CLIP_MS.
    }
    setTimeout(() => element.dispatchEvent(new Event('ended')), clipDurationMs(path))
    return Promise.resolve()
  })
  window.HTMLMediaElement.prototype.pause = vi.fn()
}
