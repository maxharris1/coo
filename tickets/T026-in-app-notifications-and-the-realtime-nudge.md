# T026. In-app notifications and the realtime nudge

Phase: 2 Install and notifications  
Depends on: T018

## Goal

The open app reacts within a second or two when something happens.

## Read first

- `docs/10-notifications.md`
- `docs/06-api.md (Notifications, Realtime)`
- `docs/07-screens.md (Notifications)`

## Build

- The Realtime subscription to `events` for the signed-in user, triggering sync. Polling stays as the fallback.
- `GET /api/notifications`, `POST /api/notifications/read`, the bell with an unread count on Main, the Notifications screen.
- A toast when a `landed-in` or `landed-out` arrives while the app is open.

## Done when

- [ ] Inserting an `events` row for the user causes a sync (mock the Supabase channel).
- [ ] With the channel erroring, the 20 second poll still runs.
- [ ] Marking read zeroes the count. Another user's notifications never appear.
- [ ] Type check, lint and the whole test suite pass.
