import type { MetadataRoute } from 'next'
import { APP_NAME } from '@/lib/constants'

/**
 * The web app manifest, served at `/manifest.webmanifest`.
 *
 * Next injects `<link rel="manifest">` for this file convention on its
 * own, so the root layout does not (and must not) also declare one.
 *
 * Everything here is a relative path to a file under `public/`: the app
 * has to install and run on a household LAN with no internet, so there
 * is no icon, no font and no `start_url` that points anywhere off this
 * origin.
 *
 * `start_url` is `/` rather than `/play`. On the family surface `/` is
 * the profile chooser -- the right place to land when a parent adds the
 * app to a tablet's home screen. On the guest surface `/` is answered
 * by the public listener with a redirect to `/play`, so a guest
 * installation lands on the game without this file needing to know
 * which surface it was fetched from.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: 'A gentle, self-hosted sight words app for children aged 5-7.',
    start_url: '/',
    display: 'standalone',
    // The pale ground the app is designed on, so the splash screen is
    // the same colour as the page it is about to show rather than a
    // flash of white.
    background_color: '#EFF6FF',
    theme_color: '#2563EB',
    icons: [
      {
        src: '/icons/app-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/app-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
