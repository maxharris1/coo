# T025. Install to the home screen

Phase: 2 Install and notifications  
Depends on: T011

## Goal

Coo sits on the home screen and opens like an app.

## Read first

- `docs/10-notifications.md (Home screen install)`
- `docs/07-screens.md (Install)`

## Looks like

- `reference/screens/png/Install.png` (and the `.html` beside it in `html/`)
- `reference/sheets/png/AppIcon.png` (and the `.html` beside it in `html/`)

## Build

- Manifest (names from config), icons, Apple meta tags, safe areas.
- `public/sw.js`: app shell and static asset caching with a version, an offline page, no API caching.
- Installed detection → `PATCH /api/settings { installed: true }` once.
- The Install screen with the iOS, Android and in-app-browser variants, in onboarding between sign-in and First bird, skipped when already installed.
- The offline banner.

## Done when

- [ ] Lighthouse (or an equivalent check) reports the app as installable.
- [ ] The manifest's name and short name equal `config/app.json`.
- [ ] With the network off, a previously opened app shows its shell and the offline line; API calls are not served from cache.
- [ ] The screen matches `reference/screens/png/Install.png` in its iOS variant.
- [ ] Unit tests for the platform detection function across user agent and display-mode cases.
- [ ] Type check, lint and the whole test suite pass.
