# T027. Push notifications

Phase: 2 Install and notifications  
Depends on: T026, T025

## Goal

A tap on the shoulder when a bird lands, even with the app closed.

## Read first

- `docs/10-notifications.md (The notification pipeline, Web push, Quiet hours)`

## Build

- The `web-push` adapter behind the `Push` port. Read the library's current docs.
- `deliver()` as in docs/10: settings, quiet hours, send to every subscription, delete dead ones. Tick step 11 for notifications held by quiet hours.
- Subscribe and unsubscribe endpoints. The ask sheet after onboarding, only when it can work. Re-subscribe on launch.
- Service worker `push` and `notificationclick` handlers.
- The ankle bell: ' Ding.' on the recipient's `landed-in` title.

## Done when

- [ ] With `FakePush`: a landing sends one push to each of the recipient's subscriptions with the right title, body, url and tag.
- [ ] A kind switched off in settings is not pushed but is in the in-app list.
- [ ] During quiet hours nothing is pushed; after they end the tick pushes it once, unless it was read.
- [ ] A 410 from the push service deletes that subscription.
- [ ] The push payload never contains the note body (assert on every kind).
- [ ] A person checks on a real iPhone that an installed app receives a push (record the result in the ticket summary; this cannot be automated).
- [ ] Type check, lint and the whole test suite pass.
