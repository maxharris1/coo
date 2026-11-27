# 10. Install, notifications and text messages

## Home screen install

Coo is a web app that should feel installed. Notifications on iPhone only work for web apps
opened from the home screen, so every new sign-up sees install right after naming their first bird.

- `src/app/manifest.ts`, served at `/manifest.webmanifest` and built from `config/app.json`:
  `display: standalone`, portrait, theme colour sky, background paper, icons 192, 512 and
  maskable 512.
- `<link rel="apple-touch-icon">` to the 180 px icon, `apple-mobile-web-app-capable`, status bar
  style `black-translucent` (so content draws under the status bar when installed),
  `viewport-fit=cover`, and safe-area padding on the tab bar and headers. Full-bleed map and
  hero chrome, toasts and the offline banner clear the status-bar inset by reading
  `env(safe-area-inset-top)` directly, never through a custom property.
- Detect "running installed" with `matchMedia('(display-mode: standalone)')` or
  `navigator.standalone`. When true, set `installed` in settings once.
- Platform detection lives in `src/lib/platform.ts` (`detectPlatform`), and the screen is one
  state machine in `src/app/(app)/welcome/install/installFlow.ts`, driven by `useInstall`. The
  same guide serves `/welcome/install` and Settings.
- **Android Chrome and Edge: the button.** Capture `beforeinstallprompt` (`preventDefault`, keep
  the event) and show one Install button that calls `prompt()`. `userChoice` "accepted" or an
  `appinstalled` event finishes. If no event arrives within 2.5 seconds, or the person dismisses
  the prompt, show "Tap your browser's menu, then Install app" in place of the button, and keep
  the heading and skip link. A late event brings the button back. The page never moves on by
  itself while it waits.
- **iOS Safari: the button and the sheet.** iPhone and iPad Safari (an iPad asking for the
  desktop site counts) show an Install button with no pointer on the page. Tapping it opens a
  dismissible sheet with three steps, written for the iOS 26 Safari layouts:
  1. Tap Share. If it is hidden, tap ••• first. Share sits at the bottom in portrait and at the
     top right in landscape.
  2. Choose Add to Home Screen. Tap View More or scroll if it is hidden.
  3. Leave Open as Web App on, then tap Add.
  The sheet closes from Close, the backdrop or Escape. Its pointer animation stops under
  `prefers-reduced-motion`. The steps are a table in `Install.tsx`, so a later Safari layout is a
  row edit.
- **In-app browsers and Chrome on iPhone: the guidance.** In an in-app browser (Instagram,
  Facebook, Gmail and other Google apps, X, LinkedIn, TikTok, Snapchat, Line, WeChat, an Android
  webview, or an iPhone webview without `Safari/` such as a Messages preview) say "Open this in
  Safari first" ("Chrome" on Android) with a Copy link button. Chrome, Firefox and Edge on iPhone
  count as in-app, because only Safari can add a web app to the home screen there.
- **Desktop: hidden.** Desktop browsers, desktop Chrome with an install prompt included, and any
  other browser skip the onboarding step and get no action in Settings.
- **Settings.** "On your home screen" shows an Install action on a phone that is not installed
  and not standalone. It opens the guide full screen without the step pill, with "Not now" in
  place of the loft skip link.
- **Once installed, it disappears.** Standalone display mode, `navigator.standalone`, an accepted
  prompt or `appinstalled` all count as installed. Onboarding moves on to the Loft, the step never
  shows again for an installed profile, and Settings shows a read-only "Yes". When Settings sees
  the install finish in a browser tab, it also saves `installed` on the profile.
- Screenshots of each state at 390 pt are in `docs/screenshots/1017/`: Android prompt, Android
  menu fallback, iOS sheet closed and open, in-app "Open this in Safari first", and Settings
  before and after install.
- Sources for the iOS 26 steps:
  [Apple iPhone User Guide, add a website icon to your Home Screen](https://support.apple.com/guide/iphone/iph42ab2f3a7/ios)
  (Share, then Add to Home Screen);
  [WebKit Features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)
  (any site added to the Home Screen opens as a web app, with the Open as Web App switch on by
  default);
  [khmyznikov/pwa-install#158](https://github.com/khmyznikov/pwa-install/issues/158)
  (Add to Home Screen hides behind View More on newer iPhones).
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
