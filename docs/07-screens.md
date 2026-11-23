# 07. Screens

Each drawn screen has a PNG in `reference/screens/png/` and a clickable HTML copy in
`reference/screens/html/` (open `Main.html` and tap around). Sizes: 390 px wide.
The mocks use sample people (Max, Priya, Theo, Rosa, Dev, Maya) and sample numbers. Layout,
colour, type and tone are the specification. The numbers are examples; real numbers come from the API.

General rules for every screen are in `AGENTS.md` under "Definition of done for a screen".

## Shell

- App pages sit inside `(app)/layout`: the sync provider, toasts, and the **tab bar** with
  Loft `/`, Flights `/flights`, the round Send button `/send`, Sill `/sill`, Seeds `/shop`.
  The Sill tab shows a dot when a bird is waiting. The tab bar is hidden on full-screen flows:
  Compose, Forecast, Takeoff, Reply, TakeoffHome, Landed, incident report, onboarding.
- On a wide screen (600 px and up, tablets and desktop) the app is a centred 430 px column on the paper colour. Below that it fills the screen width.
- Headers: a back arrow where the mock shows one, the title in the display font, the seed
  balance pill where the mock shows it.
- Time and distance are formatted by `lib/format.ts`: "11:20 am", "1h 48m", "14 sec",
  "81 miles", "0.4 mi", "3 blocks" (a block is 0.05 miles; use blocks under 0.5 miles),
  kilometres when the setting says so.

## Drawn screens

### Main (`/`) — the loft
Shows: greeting line by time of day that counts birds home, flying, on a sill, and out on a job
(odd jobs only; a bird napping or bathing counts as home), e.g. "Evening. One bird home, one
flying."; the seed balance; an
"Incoming" card for each bird headed to me (tap → tracker); "Your flock" with one row per bird:
avatar, name, one status line, a status chip (Ready, Flying, Resting, Scheduled, On a sill, On a
job) or a "Feed me" button when hungry; "n of m perches"; a link to the post office (More).
Rows tap to the bird's page. A bird drawn in the loft (on the ledge, asleep in the coop, or behind
the OUT tag) also taps to that bird's page. "Feed me" feeds in place. Empty perches show as dashed
slots. While a roommate is owed, the first says "A roommate is waiting" (tap → `/aviary/roommate`).
A ready egg takes the next empty slot: "An egg is ready" (tap → `/aviary`).

### Recipients (`/send`)
Shows: at the top, any bird of a friend's on my sill ("A reply rides home free" → Reply);
friends with distance and a quick flight time for my fastest ready bird (computed in the browser
with calm weather); on browsers with the Contact Picker, a "From your contacts" button; "Someone
new" → NewRecipient. Multi-select with a running line: "2 picked. That takes 2 birds, and 2 are
ready." Next is disabled when more are picked than birds are ready. Friends I cannot reach
(no loft yet) are greyed with a reason. A trip that waits at the loft for sunrise is timed from
sunrise: "About 4h 13m after sunrise." A bird in night-vision goggles that meets the dark flies
on, and its line reads "Flies through the night. About {t}."

### NewRecipient (`/send/new`)
Name field. Place search (`/api/geo/search`) with result rows by kind. Helper text as drawn.
After a pick, a map preview opens at the place's snapped roost from `GET /api/geo/place`, with a
draggable pin labelled with the picked place. A drag or a tap moves the pin, and arrow keys move
it one block. The pin always settles on the roost grid (`snap()` in `lib/game/privacy.ts`). It
marks the recipient's provisional sill, not an address (`docs/11-guest-links.md`).
"Next: write the note" carries `{ name, placeId }` into Compose in the URL. A moved pin goes to
Compose in `sessionStorage` under `coo:pin:{placeId}`, never in the URL. An unmoved pin stores
nothing, and the bird flies to the place's snapped roost. Compose sends the pin with the quote
and `POST /api/flights`. Its recipient card shows the neighbourhood or city the server finds for
the snapped pin.

### Compose (`/send/write`)
Shows: recipient card with place and distance and a Change link; the note field with a live
counter against the selected bird's limit; "Who's flying?" bird picker (ready birds selectable;
others shown with why not: Hungry is selectable with a warning, Napping, Flying and Too tired
are not); three stats (distance, flight time, arrival odds) and one line of plain-language
forecast from `/api/flights/quote`; a Forecast link; the release button "Release {bird}".
Flight time is the time in the air (`airTimeMs`). A bird released after dark waits at the loft
until sunrise, and the forecast says "Waits for sunrise. Leaves at {leavesAt}. Lands around
{arriveAt}." A bird that leaves now but roosts on the way shows the door-to-door time
(`durationMs`), and the forecast adds "Roosts for the night and finishes after sunrise." after
"Lands around {arriveAt}." A bird in night-vision goggles that meets the dark (`fliesInDark`)
leaves at release and flies on. Its forecast says "Flies through the night (goggles). Lands
around {arriveAt}." and its flight time is the time in the air. A leading factor, if any, follows the
forecast. The night factor is left out there, since the night line already says it.
With several recipients the picker assigns one bird per recipient, fastest bird to the farthest
friend by default, and each can be swapped.
A napping bird stays unpickable but shows a Wake button. Wake wakes it in place
(`POST /api/birds/[id]/wake`) and the picker refreshes: Ready if it can fly, Too tired if not.
Release → `POST /api/flights` → Takeoff. Errors appear as a toast and nothing is lost.

### Forecast (`/send/forecast`)
Shows: route and day; departure chips for the next hours in `config/game.json`
`schedule.forecastHours` that are still ahead, each with odds or "Roosts" when the bird would
not arrive before sunset; the selected hour's odds, duration and arrival; "Along the route"
rows from the quote's `factors`; the sunset line; two buttons: schedule for the best hour, or
send at the selected hour. If the selected hour is now, the second button releases at once.
For a bird that waits at the loft for sunrise (`leavesAt` after `releaseAt`), the selected
hour's detail reads "Waits for sunrise, then about {airTimeMs} in the air. Lands near
{arriveAt}." For a bird in night-vision goggles that flies through the dark (`fliesInDark`), it
reads "Flies through the night. About {airTimeMs}. Lands near {arriveAt}." and the sunset line
reads "Sunset is {sunsetAt}. With goggles on, {bird} flies on through the dark." Other hours
read "About {durationMs}. Lands near {arriveAt}."

### Takeoff (`/send/takeoff/[flightId]`) and TakeoffHome (`/sill/[visitId]/takeoff`)
The 1.5 second takeoff sequence from `assets/motion.css` (see the Motion sheet), then the copy as
drawn, then an automatic move to the tracker after one more second. Tapping the button goes at
once. With reduced motion, show the final frame and do not auto-advance.
After a send to a guest, Takeoff goes to ShareLink instead.

### ShareLink (`/send/share/[flightId]`)
Shows the link once, the message preview, "Text it to {name}" (an `sms:` link with the template
from `config/copy/sms.json`), Copy, and Share (Web Share API where present). The token exists only
in this page's state; if the page is reloaded, show "This link was shown once. Send another bird
to make a new one." and a button to the tracker.

### Flight (`/flights/[id]`) — the tracker, three scales and night
One screen. `Flight`, `FlightBlock` and `FlightLong` are the same screen at different distances.
- Map fills the top (`docs/09-map.md`): route, origin and destination pins, the bird sprite at
  `positionAt`, a thought bubble from `config/copy/flight-log.json` every so often.
- Card: avatars of bird and recipient, a state chip (In the air, Roosting, Delayed, Landed,
  Scheduled), the headline "{bird} is over {place}" / "Asleep near {place}" / "Last seen near
  {place}", a sub line, a progress bar with from-label, "{x} of {y} mi", to-label.
- Three stats. Flying: Lands in, Speed, Altitude. Roosting: Takes off again, Lands roughly,
  Tonight's roost. Altitude and roost names are for fun, picked by hash from short lists in the
  copy file's tone (Rooftop, Lowish, Quite high; A barn, A water tower, A ledge).
- Flight log, newest first, events whose time has passed. Seconds are shown for flights under ten minutes.
- For an incoming flight the sub line reads "Carrying a note for you" and there is no log of
  the sender's seeds.
- When the flight lands while open: the landing animation, then for my bird a "Delivered" card
  with seeds earned; for an incoming bird, a button to the Landed screen.
- A delayed flight (major) shows a banner linking to the incident report.

### Lost (`/flights/[id]/incident`) — incident report
As drawn. Fields from the flight: bird, route, last seen (place name at the delay point and the
time), cause (the delay line picked for this flight), note status. Buttons: search party (shows
cost; disabled after use, with the result: "Found him. Back in the air." or "They found a
different pigeon. Sorry."), Wait it out (back to tracker), Resend with another bird (opens
Compose with the same recipient and body). The footer counts this bird's detours.
The report number is the owner's count of delayed flights.

### Flights (`/flights`)
Sections: Your birds (scheduled, flying and delayed), Coming to you, Landed today, then a
"Earlier" list that pages. Each row taps to the tracker. Odd jobs in progress appear under
Your birds with their end time. The "On odd jobs" cards tap to the job tracker
(`/jobs/[id]`). A card whose job id is not known stays as text with no link.

### Job (`/jobs/[id]`) — the odd-job tracker
Owner only. Another user's job id shows "We could not find this job." with a link back to Earn.
The map reuses the tracker's `MapView` with the two legs from `jobLegs`. On the way out the bird
flies from the "Your loft" pin to the destination pin, and the card says "On an odd job". From
the midpoint it flies back with no wait and the card says "Heading home". The pin labels swap
with the leg, so each pin keeps its own name. Both legs show "Home at {ends_at}" and the job's
text. Once the job is done or `ends_at` has passed, the page says "{bird} is home." and links to
Earn. A job started before destinations were stored has no map and shows the text card only.
There are no odds, search party or seeds line.

### Landed (`/sill/[visitId]`) and the Sill tab (`/sill`)
`/sill` lists birds waiting on my sill, soonest to leave first, then notes that arrived in the
last 7 days. With one waiting bird it opens that bird's Landed screen directly.
Landed is as drawn: the postmarked note card (postmark = sender's city and date), the trip
summary line, "Send {bird} home with a reply", the snack button (hidden after use), and the
countdown line. After the bird has left the buttons are replaced by "{bird} has gone home.
Reply with one of your own birds." → Compose.

### Reply (`/sill/[visitId]/reply`)
As drawn. Counter against the visiting bird's limit. The estimate uses that bird's speed.
"Send one of my own birds instead" → Compose for that friend.

### Pigeon (`/birds/[id]`)
As drawn: portrait in the current outfit and mood pose (see the pose table in `docs/08`), level
line, mood sentence, "Open closet", three care meters with Feed, Bath and Nap, the sulk
explanation, abilities (speed, range, navigation dots, focus dots), two quirk chips, the record
line. Renaming is a tap on the name. A bird that is away shows where it is and disables care.
A napping bird shows "Napping until {time}" and its Energy row offers Wake instead of Nap.
Feed and Bath stay disabled. After waking, the mood and meters follow its energy.

### Wardrobe (`/birds/[id]/closet`)
As drawn: the bird on a stand wearing the selection, a "what it does" list for worn items, a
weather tip built from tomorrow's forecast at the loft when it is cold, wet or snowy, saved
outfits, and the closet grid. Owned items toggle on and off (one per slot; picking a second
item in a slot swaps). Items worn by another bird say "On {name}" and can be taken if that bird
is home. Unowned items show their price and link to the store. Changes save on tap.

### Shop (`/shop`)
As drawn: balance, "More ways" → Earn, gear list (owned items say "In the closet"), loft items,
the next perch with "n to go" when short, and the Espresso shot (25 seeds, "One night of
flying") under "For the loft" with "{n} owned" beside its effect once the player holds any. It
stays buyable after each buy. Buying asks once: "Buy the rain hat for 120 seeds?"

### Earn (`/earn`)
As drawn: the punch card with 10 stamp slots, the pay table, two odd jobs with a "Send {bird}"
button that picks the first ready bird and lets you change it, and found objects with
"Trade for n". After a send succeeds the app opens the job tracker (`/jobs/[id]`). A refused
send stays on Earn and shows the reason as a toast. Each "{bird} is out on an odd job" row links
to that job's tracker, and stays as text when the job id is not known. A job with a bird on it
leaves the offers until it is done, so while both of today's jobs run Earn shows the two running
rows and no Send button. "That's all the odd jobs for today." shows only when no jobs are left today.

### More (`/more`)
As drawn. Six rows with live sub lines.

### Friends (`/friends`)
As drawn: my invite link with Copy and "Text it"; the explanation; each friend with where they
are (as far as they let me see), distance, and my City / Block toggle for them; guest links
still waiting. A friend row opens a sheet: Send a bird, Shoebox with them, Unfriend, Block, Report.

### Shoebox (`/shoebox`)
As drawn: filter chips by friend, note cards newest first with direction, body, bird and trip summary.

### Collections (`/collection`)
As drawn: postmark grid with empty slots, badges with progress, birds met.

### Aviary (`/aviary`)
As drawn: perches, the egg with deliveries to go, the six breeds with owned ones marked.
A ready egg shows "Hatch" → the hatch moment (below).

### Settings (`/settings`)
As drawn, plus: the travel switch under "Where birds find me" ("I'm away from home" → pick a
place or use my location), SMS fallback switch under notifications, "Delete my account".

### Welcome, Install
See onboarding below.

### Guest and GuestClaim (`/b/[slug]`)
One public page with two states. See `docs/11-guest-links.md`.

## Screens that are specified but not drawn

Build these from the components on the Components sheet, in the same style. Copy is given.

| Screen | Route | Content |
|---|---|---|
| Hello | `/welcome` | Logo, "Messages, eventually.", the hero illustration, one paragraph: "Write a note. Tie it to a pigeon. It flies there for real, on a real map, at pigeon speed." Button "Get a pigeon" → sign-in. Link "I already have a loft" → sign-in |
| Phone | `/sign-in` | "What's your number?" Phone field with country code (default +1). "We text you a code. That's the whole password." Button "Text me the code". Small print below it: `legal.consent.signIn` from `config/copy/legal.json`, with Terms and Privacy as links |
| Code | `/sign-in/verify` | Six boxes, auto-submit, "Send it again" after 30 seconds, wrong-code line: "That's not it. Try once more." |
| Install | `/welcome/install` | Drawn. Step 1 of 3. Instructions change by platform: iOS Safari (Share → Add to Home Screen), Android Chrome (uses the install prompt event; one button "Install"), other browsers (skip quietly). The skip link turns on SMS fallback. If already running from the home screen, skip this step |
| First bird | `/welcome/bird` | Drawn (Welcome). Step 2 of 3. One panel: your name (prefilled from a guest link), then swipe between three looks, name field with a shuffle button for suggestions, pronoun chips, Adopt. |
| Loft | `/welcome/loft` | Step 3 of 3. "Where should birds find you?" Two choices: "Use my location" (browser geolocation → `/api/geo/here`) or search a neighbourhood. Shows the result as "Your roost: Williamsburg, Brooklyn" on a small map at block zoom with the roost pin, and the line "We keep the roost, not your address." A link "Use my town centre instead" stores the snapped city centre as the roost. Button "This is home". Arriving from a guest link, the map opens at the flight's destination under "Is this where birds should find you?" (`docs/11-guest-links.md`) |
| Notifications ask | part of first Main visit | A sheet after onboarding when running from the home screen: "Want a tap on the shoulder when a bird lands?" Yes → browser permission prompt. No → nothing. Never ask from a browser tab on iOS, where it cannot work |
| Join | `/join/[code]` | Public. "{name} wants to trade pigeons with you." Signed in: button "Add {name}". Signed out: "Get a pigeon" → sign-in, then back here |
| Notifications | `/notifications` | Reached from a bell in the Main header. List of notification rows with icon, title, body, time |
| Hatch moment | `/aviary/hatch` | The egg wobble and crack sequence from the Motion sheet, the new bird, its breed card, name field, pronoun chips, "Welcome home" |
| Adopt roommate | `/aviary/roommate` | Reached from the Loft. "{first bird} has a roommate" over the next starter look, a name field prefilled with a free name that skips the first bird's, pronoun chips, "Adopt {name}" → back to the Loft. A loft not owed a roommate sees "No roommate waiting", "Nobody new is moving in right now." and "Back to the loft" |
| Scheduled state | tracker | The tracker for a scheduled flight: map at the loft, "Leaves at 7:00 am", a Cancel button |
| Travel sheet | Settings | Search or use location, the 12 hour note, "Your flock comes with you. Birds already flying land where they were sent." |
| Link expired | `/b/[slug]` | "That link has expired. The bird went home with the note." |
| Dev panel | `/dev` | Not in production. Buttons: +10 min, +1 hour, +1 day, jump to next landing, reset clock, +500 seeds, run tick |

## Empty, loading and error states

- Loading: the paper background with the walking-pigeon loader from the Motion sheet after 400 ms.
- Empty states use `assets/copy/empty-states.json` and the matching illustration.
- Offline: a thin banner with the offline line. Trackers keep animating from the stored plan.
- Errors: a toast with the API's message. Forms keep what was typed.

## Navigation summary

```
/welcome → /sign-in → /sign-in/verify → /welcome/install → /welcome/bird → /welcome/loft → /
/  ↔ /flights ↔ /sill ↔ /shop          (tabs)
/send → /send/write → (/send/forecast) → /send/takeoff/[id] → /flights/[id]
/send → /send/new → /send/write → /send/takeoff/[id] → /send/share/[id] → /flights/[id]
/sill/[visit] → /sill/[visit]/reply → /sill/[visit]/takeoff → /flights/[id]
/flights/[id] → /flights/[id]/incident
/ → /birds/[id] → /birds/[id]/closet → /shop
/ → /more → /friends | /shoebox | /collection | /aviary | /earn | /settings
/b/[slug]  (public)      /join/[code]  (public)
```
