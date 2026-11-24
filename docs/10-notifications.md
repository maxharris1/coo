# 10. Install, notifications and text messages

## Home screen install

Coo is a web app that should feel installed. Notifications on iPhone only work for web apps
opened from the home screen, so every new sign-up sees install right after naming their first bird.

- `public/manifest.webmanifest` from `assets/`: `display: standalone`, portrait, theme colour sky,
  background paper, icons 192, 512 and maskable 512. Name and short name from `config/app.json`.
- `<link rel="apple-touch-icon">` to the 180 px icon, `apple-mobile-web-app-capable`, status bar
  style `black-translucent` (so content draws under the status bar when installed),
  `viewport-fit=cover`, and safe-area padding on the tab bar and headers. Full-bleed map and
  hero chrome, toasts and the offline banner clear the status-bar inset by reading
  `env(safe-area-inset-top)` directly, never through a custom property.
- Detect "running installed" with `matchMedia('(display-mode: standalone)')` or
  `navigator.standalone`. When true, set `installed` in settings once.
- The Install screen (drawn) shows iPhone steps on iOS Safari. On Android Chrome, capture the
  `beforeinstallprompt` event and show one Install button. In an in-app browser (Instagram,
  Messages preview and so on) say "Open this in Safari first" with a copy-link button.
- The service worker (`public/sw.js`, hand-written, no library) does three things: caches the
  app shell and static assets so the app opens offline, shows push notifications, and opens the
  right page when one is tapped. Do not cache API responses.

## The notification pipeline

Everything goes through one function: `notify(deps, tx, { userId, kind, refId, vars })`.

1. Build title, body and url from `config/copy/notifications.json` and `vars`.
2. Insert into `notifications` inside the caller's transaction. The unique index makes a repeat a no-op.
3. Insert an `events` row.
4. After the transaction commits, `deliver(notificationId)`:
   - If the kind's setting is off for this user: stop. The row stays in the in-app list.
   - If it is quiet hours for the user: set `push_held_until` to the instant they end, worked out
     now in the user's current time zone, and stop. Step 11 of the tick delivers it at or after
     that instant, unless it has been read in the app by then.
   - If the user has any push subscription: send to all of them, set `push_sent_at`.
     A 404 or 410 from the push service deletes that subscription.
   - If no push was sent, the kind is marked `"sms": true`, and `sms_fallback` is on: send the
     text from `config/copy/sms.json`, set `sms_sent_at`. At most one text per user per 15
     minutes; extra ones are dropped, not queued. The number is read through the
     `sms_phone(p_user)` definer function, since `coo_app` has no access to schema `auth`.

Kinds, text and which setting controls each are in `config/copy/notifications.json`:
`incoming`, `landed-in`, `landed-out`, `reply-home`, `reply-delivered`, `home-empty`, `delayed`,
`delayed-in`, `roosting`, `hungry`, `hatched`, `tip`, `friend-joined`, `link-expired`.

If the bird that landed wears the ankle bell, the recipient's `landed-in` title ends with " Ding."

## Web push

- Keys: one VAPID key pair, generated once (`npx web-push generate-vapid-keys`), in env vars.
- Subscribe only after the user says yes to our own sheet, and only when running installed on
  iOS. `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`,
  then `POST /api/push/subscribe`.
- Payload: `{ title, body, url, tag }` where `tag` is `kind:refId` so a repeat replaces itself.
  Icon `icon-192.png`, badge `icon-mono` rendered to PNG.
- `notificationclick`: focus an open window and navigate it, or open `url`.
- Re-subscribe on every launch if permission is granted but there is no subscription
  (iOS drops them now and then).

## Text messages

Two different things use texts.

**Sign-in codes** are sent by Supabase Auth through its phone provider. Configure Twilio (or
Twilio Verify) in the Supabase dashboard. Our code never sends these.

**Landing texts** are sent by our `Sms` port (Twilio's Messages API over `fetch`):

- To users without push, for `landed-in` and `reply-home` only.
- To a guest who left a number on the guest page, once, when their bird lands.
- Every one ends with the stop line from `config/app.json`. Handle Twilio's opt-out: when Twilio
  reports a number as unsubscribed (error 21610 at the time of writing; confirm), set `sms_fallback = false` for that user.
- Never between the user's quiet hours.

In the United States, app-sent texts need the sending number registered (10DLC or a verified
toll-free number). That takes days to weeks and is a human task: `docs/15-open-items.md`.
Until it is done, landing texts will be blocked by carriers; the app must work without them.

## Quiet hours

Default on, 10 pm to 7 am in the user's time zone. Birds still land and notes still arrive.
Push and texts wait. If the start is later than the end the range crosses midnight.
