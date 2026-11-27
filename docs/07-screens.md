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
- The tab bar is an 84 px band plus the home-indicator inset below it (`max(env(safe-area-inset-bottom), 34px)`), and it paints over that inset. The shell pads every tab page at the bottom by 96 px plus the same inset (`--coo-tabs-pad`), so the last row scrolls clear of the bar, and pages add no spacer of their own. The bar stays pinned to the bottom of the viewport while a tab page scrolls, in Safari and in the installed app. The icons and the Send button stay still when iOS collapses or expands its toolbar and when a page overscrolls (rubber-band) at the top or bottom. They sit at one offset from the screen bottom for any inset from 0 to 34 px, and the band keeps its 84 px height. Screenshots of a tall Flights and a tall Loft page, mid-scroll and at the bottom, are in `docs/screenshots/1029/`. It is centred with auto margins, not a transform, and no shell ancestor has a transform, filter, containment or scroller, because any of those lets iOS carry a fixed bar up with the page. The shell's minimum height is the screen less the top and bottom insets, so a short page fills the screen without a scrollbar.
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
Rows tap to the bird's page. The loft scene at the top of the screen is one yellow house on a
rooftop, drawn as `docs/17-loft-scene.md` specifies; that document has the sizes, colours, times
of day and motion. The loft scene follows the sun: it shows sunrise, day, sunset, dusk or night
from the sun at the user's loft, as [`docs/17-loft-scene.md` section 5](17-loft-scene.md#5-times-of-day)
describes. Every owned perch is a room on the front of the house, three rooms to a floor,
filled bottom-left first. Three perches make one floor; at four or five perches a second floor
two rooms wide sits on top, which makes the house taller. Bird `i` in flock order owns room `i`,
so a new hatchling never moves anyone. An awake home bird (napping and bathing count as home) sits
on its room's perch. A tired or napping bird, and every home bird once the sun is down, sleeps on
its own perch in the `sleep` pose. A bird away (flying, on a sill, on a job) leaves one
feather on its perch in its wing colour. A free room holds a suitcase while a roommate is owed
(tap → `/aviary/roommate`), then an egg in a nest when one is due (tap → `/aviary`), otherwise a
bare perch. With four perches the fifth room is built but not bought and hangs a "TO LET" sign
(tap → `/shop`). Each room with a bird, home or away, taps to that bird's page. The scene moves
gently: the clouds drift slowly back and forth, and each awake bird plays a one-shot idle (hop,
preen, ruffle, look around, wing stretch, coo bob) on its own timer with rests of several seconds
between, never leaving its perch. Sleeping birds play no idles. With reduced motion on, all of it
is off (still clouds, still birds, no idle timers). While the tab is hidden the scene pauses and
its timers stop. "Feed me" feeds in place. Empty perches show as dashed
slots. While a roommate is owed, the first says "A roommate is waiting" (tap → `/aviary/roommate`).
A ready egg takes the next empty slot: "An egg is ready" (tap → `/aviary`).

### Recipients (`/send`)
Shows: at the top, any bird of a friend's on my sill ("A reply rides home free" → Reply);
friends with distance and a quick landing time for my fastest ready bird (computed in the browser
with calm weather); on browsers with the Contact Picker, a "From your contacts" button; "Someone
new" → NewRecipient. Multi-select with a running line: "2 picked. That takes 2 birds, and 2 are
ready." Next is disabled when more are picked than birds are ready. Friends I cannot reach
(no loft yet) are greyed with a reason. The landing time is a time of day in the quote voice
(`docs/14-content-voice.md`): "Lands this afternoon." A trip that waits at the loft for sunrise
reads "Waits for sunrise. Leaves at first light. Lands {phrase}." A bird in night-vision goggles
that meets the dark flies on, and its line reads "Flies through the night. Lands {phrase}."

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
Flight time is the time in the air (`airTimeMs`). The forecast gives the landing as a time of
day in the quote voice, read from the release (`docs/14-content-voice.md`): "Lands {phrase}.",
such as "Lands this afternoon." A short hop reads "Lands shortly." A bird released after dark
waits at the loft until sunrise, and the forecast says "Waits for sunrise. Leaves at first
light. Lands {phrase}." A bird that leaves now but roosts on the way shows the door-to-door time
(`durationMs`), and the forecast adds "Roosts for the night and finishes after sunrise." after
"Lands {phrase}." A bird in night-vision goggles that meets the dark (`fliesInDark`)
leaves at release and flies on. Its forecast says "Flies through the night (goggles). Lands
{phrase}." and its flight time is the time in the air. A leading factor, if any, follows the
forecast. The night factor is left out there, since the night line already says it.
When the picked bird's quote has an `espresso` variant (it would roost and wears no goggles),
the row shows a checkbox under the stats: "Espresso shot · keep {bird} up tonight". It starts
unticked. It is disabled when unticked and the rows already ticked use every shot the player
holds (`me.espressoShots`), so at 0 shots it is always disabled. Any change of the row's bird
clears the tick, whether the player picks another bird, a sync makes the bird unable to fly or
a change of recipients reassigns the birds, and getting the first bird back does not bring the
tick back. While ticked, the
row's stats come from the variant: the forecast says "Flies through the night (espresso). Lands
{phrase}.", the flight time is the variant's time in the air and the odds are the
variant's odds. Release sends `espresso: true` on that row's send only when it is ticked. The
Forecast page offers no shot, since it schedules and a scheduled send refuses one.
With several recipients the picker assigns one bird per recipient, fastest bird to the farthest
friend by default, and each can be swapped.
A napping bird stays unpickable but shows a Wake button. Wake wakes it in place
(`POST /api/birds/[id]/wake`) and the picker refreshes: Ready if it can fly, Too tired if not.
Release → `POST /api/flights` → Takeoff. Errors appear as a toast and nothing is lost.

### Forecast (`/send/forecast`)
Shows: route and day; departure chips for the next hours in `config/game.json`
`schedule.forecastHours` that are still ahead, each with odds or "Roosts" when the bird would
not arrive before sunset; the selected hour's odds and landing time; "Along the route"
rows from the quote's `factors`; the sunset line; two buttons: schedule for the best hour, or
send at the selected hour. If the selected hour is now, the second button releases at once.
The landing is a time of day in the quote voice, read from that hour's release
(`docs/14-content-voice.md`). The selected hour's detail reads "Lands {phrase}.", such as "Lands
this evening." For a bird that waits at the loft for sunrise (`leavesAt` after `releaseAt`), it
reads "Waits for sunrise. Leaves at first light. Lands {phrase}." For a bird in night-vision
goggles that flies through the dark (`fliesInDark`), it reads "Flies through the night. Lands
{phrase}." and the sunset line reads "Sunset is {sunsetAt}. With goggles on, {bird} flies on
through the dark." The departure chips and the sunset line keep their clock times.

### Takeoff (`/send/takeoff/[flightId]`) and TakeoffHome (`/sill/[visitId]/takeoff`)
The 1.5 second takeoff sequence from `assets/motion.css` (see the Motion sheet), then the copy as
drawn, then an automatic move to the tracker after one more second. Tapping the button goes at
once. With reduced motion, show the final frame and do not auto-advance.
Takeoff reads "{bird} has your note for {recipient}. {He} should land {phrase}." TakeoffHome
reads "{bird} has your reply for {recipient}. {He} should land {phrase}." The phrase is a time
of day in the quote voice, read from the release. "Released {time}" keeps its clock.
After a send to a guest, Takeoff goes to ShareLink instead.

### ShareLink (`/send/share/[flightId]`)
Shows the link once, the status line "Flying to {city}. Lands {phrase}.", the message preview,
"Text it to {name}" (an `sms:` link with the template from `config/copy/sms.json`), Copy, and Share (Web Share API where present). The token exists only
in this page's state; if the page is reloaded, show "This link was shown once. Send another bird
to make a new one." and a button to the tracker.

### Flight (`/flights/[id]`) — the tracker, three scales and night
One screen. `Flight`, `FlightBlock` and `FlightLong` are the same screen at different distances.
- Map fills the top (`docs/09-map.md`): route, origin and destination pins, the bird sprite at
  `positionAt`, a speech bubble from `config/copy/flight-log.json` every so often.
- The map paints behind the status bar. The floating header (back button, route, state chip)
  sits 16px below the status-bar inset, so the clock and Dynamic Island never cover it.
- The map bird's pose matches the state chip: flying, asleep while roosting, surprised while
  delayed, perched at the origin while scheduled, and landed on the destination pin once landed.
- Card: avatars of bird and recipient, a state chip (In the air, Roosting, Delayed, Landed,
  Scheduled), the headline "{bird} is over {place}" / "Asleep near {place}" / "Last seen near
  {place}", a sub line, a progress bar with from-label, "{x} of {y} mi", to-label.
- Three stats. Flying: Lands ("this afternoon"), Speed, Altitude. Roosting: Takes off again
  ("first light"), Lands, roughly ("tomorrow morning"), Tonight's roost. Landed: Lands in
  ("0 sec"), Speed, Altitude. Landing times are a time of day in the live voice
  (`docs/14-content-voice.md`). Altitude and roost names are for fun, picked by hash from short
  lists in the copy file's tone (Rooftop, Lowish, Quite high; A barn, A water tower, A ledge).
- Flight log, newest first, events whose time has passed. Seconds are shown for flights under ten minutes.
- For an incoming flight the sub line reads "Carrying a note for you" and there is no log of
  the sender's seeds.
- A trip home (`kind = 'return'`) reads the way the Flights list does: the bird is coming to
  the owner. For the owner the header is "{bird} → You", "Your loft" sits on the destination pin
  and "{host}, {from}" on the origin pin, and the sub line is "Coming home from {host}" or
  "Bringing a reply from {host}", never a note carried to the host. For the host the header is
  "{bird} → {owner}", "Your sill" sits on the origin and "{owner}, {to}" on the destination, and
  the sub line is "Heading back to {owner}" or "Carrying a note to {owner}". The route and the
  progress bar still run from origin to destination.
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
On a trip home the sub line is about the trip home ("{bird} is running late on the way home.",
plus the reply from the host when one is attached) and there is no Resend button.

### Flights (`/flights`)
The title "Flights" and the header pill sit at the top in normal flow, below the body's
`env(safe-area-inset-top, 0px)` padding. The pill reads "All home" when nothing is out or
coming in, otherwise "{N} out, {M} coming in".

**In the air** lists your flights, then incoming ones, as cards. Each card shows a map preview
that cannot be dragged or zoomed, the bird's name, a status chip, a sent or received badge with
the other person, and the fuzzy arrival or leave line. The whole card taps to the tracker
(`/flights/[id]`). Odd jobs in progress follow the flight cards with "Home {phrase}" and no
heading of their own. A job card with a stored destination shows a map preview and taps to the
job tracker (`/jobs/[id]`). A job card with no job id or no destination stays as text with no
link. With no flight in the air and no odd job, "In the air" shows the card "No birds in the
air. Suspiciously quiet." and past flights still list below it. Filters never hide this section.

**Filters.** Under "In the air", once any past flight is loaded, chips read All, Sent and
Received. All is pressed by default. With two or more birds in the loaded past flights, a
second row has one chip per bird. Picking birds keeps only their flights, and picking none
means every bird. The chips filter only the past list. Each chip is a 44 px button with
`aria-pressed`, a sun fill when pressed and a focus ring. When nothing matches, the past list is
replaced by the line "No flights match these filters."

**Day groups.** Past flights (landed today and the loaded earlier pages) fall into Today,
Yesterday, This week (from Monday) and Earlier, by the viewer's local midnights. Empty groups
are left out. Each group header is a 44 px button with the group's name and its flight count. The
newest group shown starts open and the others start collapsed. A landed row shows the bird's
avatar, a sent or received badge, "{bird} · {other}" and "{distance} · {trip time}", or
"Cancelled". Each row taps to its tracker.

**Test hops.** Flights with a distance of exactly 0 are left out of the group's rows and
count. They fold into a collapsed "{N} test hops" button at the bottom of their group, which
opens to the same rows.

**Show more.** While the API has more history, a "Show more" button at the bottom loads the
next page by cursor. The new flights join their day groups.

### Job (`/jobs/[id]`) — the odd-job tracker
Owner only. Another user's job id shows "We could not find this job." with a link back to Earn.
The map reuses the tracker's `MapView` with the two legs from `jobLegs`. On the way out the bird
flies from the "Your loft" pin to the destination pin, and the card says "On an odd job". From
the midpoint it flies back with no wait and the card says "Heading home". The pin labels swap
with the leg, so each pin keeps its own name. Both legs show "Home {phrase}" and the job's
text. Once the job is done or `ends_at` has passed, the page says "{bird} is home." and links to
Earn. A job started before destinations were stored has no map and shows the text card only.
There are no odds, search party or seeds line.

### Landed (`/sill/[visitId]`) and the Sill tab (`/sill`)
`/sill` lists birds waiting on my sill, soonest to leave first, then notes that arrived in the
last 7 days. A waiting bird's row reads "From {name}. Leaves {phrase}." With one waiting bird it opens that bird's Landed screen directly.
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
A bird in flight, or scheduled with a known flight, shows "Watch this flight", which opens its
flight tracker. A bird on an odd job with a known job id shows "Watch this odd job", which opens
its job tracker. Visiting, naps, baths and jobs without an id stay as text.
A napping bird shows "Napping until {time}" and its Energy row offers Wake instead of Nap.
Feed and Bath stay disabled. After waking, the mood and meters follow its energy.

### Wardrobe (`/birds/[id]/closet`)
As drawn: the bird on a stand wearing the selection, a "what it does" list for worn items, a
weather tip built from tomorrow's forecast at the loft when it is cold, wet or snowy, saved
outfits, and the closet grid. Owned items toggle on and off (one per slot; picking a second
item in a slot swaps). An unlocked item stays tappable when another bird wears it, home or
away. Tapping it puts it on this bird too, and the other bird keeps it. Saved outfits put on
every owned piece the same way. Unowned items show their price and link to the store. Changes
save on tap.

### Shop (`/shop`)
As drawn: balance, "More ways" → Earn, gear list (owned items say "Unlocked"), then "For the
loft": the rooftop birdbath, flower boxes, weathervane and espresso cart in that order, the
next perch with "n to go" when short, and the Espresso shot (25 seeds, "One night of flying")
with "{n} owned" beside its effect, "0 owned" when the player holds none. The shot stays
buyable after each buy. An owned birdbath says "In the loft". An owned flower box, weathervane
or espresso cart says "On the roof". Buying asks once: "Buy the rain hat for 180 seeds?"
Buying gear the flock already unlocked is refused with "You already unlocked that." and costs
nothing.

### Earn (`/earn`)
As drawn: the punch card with 10 stamp slots, the pay table, two odd jobs with a "Send {bird}"
button that picks the first ready bird and lets you change it, and found objects with
"Trade for n". After a send succeeds the app opens the job tracker (`/jobs/[id]`). A refused
send stays on Earn and shows the reason as a toast. Each "{bird} is out on an odd job" row links
to that job's tracker, and stays as text when the job id is not known. A job with a bird on it
leaves the offers until it is done, so while both of today's jobs run Earn shows the two running
rows and no Send button. "That's all the odd jobs for today." shows only when no jobs are left today.

### More (`/more`)
As drawn. Six rows with live sub lines. Below the grid, one full-width "Report a bug" row,
"Something's off? Tell us.", opens `/more/report-bug`. It is not in the mock.

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
"On your home screen" under App shows an Install action on a phone browser that can install
(an Android browser whose user agent carries `Chrome/`, such as Chrome, Edge, Samsung Internet or
Opera; any Android browser that has already fired `beforeinstallprompt`; iOS Safari; or an in-app
browser), while the profile is not installed and the page is not running standalone. It opens the Install guide full screen, without the step pill
and with "Not now" in place of the loft skip link. Once installed (profile flag, standalone, or an
`appinstalled` event in this tab) the row shows a read-only "Yes" and the action is gone, on any
browser. Desktop browsers, and Android browsers that skip the Install step, never get the action:
the row reads "Yes" when the profile is installed and "No" when it is not.

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
| Install | `/welcome/install` | Drawn. Step 2 of 3, right after First bird, for every new sign-up (direct, invite code or guest link). The heading, the home-screen picture and the skip link show at once; what sits under the picture depends on the browser (`src/lib/platform.ts`, `installFlow.ts`). Android browsers whose user agent carries `Chrome/` (Chrome, Edge, Samsung Internet, Opera): one Install button once `beforeinstallprompt` arrives, which opens the system prompt. If no event arrives within 2.5 seconds, or the person dismisses the prompt, the line "Tap your browser's menu, then Install app" replaces the button; a late event brings the button back. iOS Safari (iPad too, including an iPad asking for the desktop site): an Install button that opens a sheet with three steps: Share (tap ••• first if it is hidden; bottom in portrait, top right in landscape and on iPad), Add to Home Screen (View More or scroll), and leave Open as Web App on, then Add. The sheet closes from Close, the backdrop or Escape. In-app browsers (Instagram, Facebook, Gmail, X, LinkedIn and others) and Chrome, Firefox or Edge on iPhone: "Open this in Safari first" ("Chrome" on Android) with a Copy link button. Desktop browsers skip the step, and so does an Android browser without `Chrome/` in its user agent (Firefox, for one) unless it has already fired `beforeinstallprompt`, which gets the button. Accepting the prompt, an `appinstalled` event or opening from the home screen moves on to the Loft, and the step never shows again once the profile is installed. The skip link turns on SMS fallback and goes to the Loft. Settings offers the same guide from "On your home screen" (see Settings above). Screenshots of every state are in `docs/screenshots/1017/`. Sources are listed under Home screen install in `docs/10-notifications.md` |
| First bird | `/welcome/bird` | Drawn (Welcome). Step 1 of 3. One panel: your name (prefilled from a guest link), then swipe between three looks, name field with a shuffle button for suggestions, pronoun chips, Adopt → Install. |
| Loft | `/welcome/loft` | Step 3 of 3. "Where should birds find you?" Two choices: "Use my location" (browser geolocation → `/api/geo/here`) or search a neighbourhood. Shows the result as "Your roost: Williamsburg, Brooklyn" on a small map at block zoom with the roost pin, and the line "We keep the roost, not your address." A link "Use my town centre instead" stores the snapped city centre as the roost. Button "This is home". Arriving from a guest link, the map opens at the flight's destination under "Is this where birds should find you?" (`docs/11-guest-links.md`) |
| Notifications ask | part of first Main visit | A sheet after onboarding when running from the home screen: "Want a tap on the shoulder when a bird lands?" Yes → browser permission prompt. No → nothing. Never ask from a browser tab on iOS, where it cannot work |
| Join | `/join/[code]` | Public. "{name} saved you a perch." ("A friend saved you a perch." with no name), then "Keep a pigeon and send notes, at pigeon speed." Signed in: button "Add {name}" ("Add friend" with no name). Signed out: "Get a pigeon" → sign-in, then back here. Copy lives in `src/lib/inviteCopy.ts`. |
| Notifications | `/notifications` | Reached from a bell in the Main header. List of notification rows with icon, title, body, time |
| Hatch moment | `/aviary/hatch` | The egg wobble and crack sequence from the Motion sheet, the new bird, its breed card, name field, pronoun chips, "Welcome home" |
| Adopt roommate | `/aviary/roommate` | Reached from the Loft. "{first bird} has a roommate" over the next starter look, a name field prefilled with a free name that skips the first bird's, pronoun chips, "Adopt {name}" → back to the Loft. A loft not owed a roommate sees "No roommate waiting", "Nobody new is moving in right now." and "Back to the loft" |
| Scheduled state | tracker | The tracker for a scheduled flight: map at the loft, "Leaves at 7:00 am", a Cancel button |
| Travel sheet | Settings | Search or use location, the 12 hour note, "Your flock comes with you. Birds already flying land where they were sent." |
| Link expired | `/b/[slug]` | "That link has expired. The bird went home with the note." |
| Report a bug | `/more/report-bug` | Full screen, back arrow to `/more` labelled "Back to the post office". "Report a bug", "Something's off? Tell us what happened.", a text box "What happened, and what did you expect?" (up to 2000 characters, "1850 of 2000" from 1800), "We'll include: the page you came from ({route}), your app version, your device and screen size, and your time zone.", "Please don't put passwords, addresses or note text in here." Button "Send the report" ("Sending"). Posts to `/api/bug-reports`. On success the form gives way in place to "Report sent.", "A pigeon has it. Thank you for the details." and "Back to the post office". Copy lives in `src/app/(app)/more/report-bug/copy.ts` |
| Dev panel | `/dev` | Not in production. Buttons: +10 min, +1 hour, +1 day, jump to next landing, reset clock, +500 seeds, run tick |

## Empty, loading and error states

- Loading: the paper background with the walking-pigeon loader from the Motion sheet after 400 ms.
- Empty states use `assets/copy/empty-states.json` and the matching illustration.
- Offline: a thin banner with the offline line. Trackers keep animating from the stored plan.
- Errors: a toast with the API's message. Forms keep what was typed.

## Navigation summary

```
/welcome → /sign-in → /sign-in/verify → /welcome/bird → /welcome/install → /welcome/loft → /   (or /join/{code}, or the claimed guest link)
/  ↔ /flights ↔ /sill ↔ /shop          (tabs)
/send → /send/write → (/send/forecast) → /send/takeoff/[id] → /flights/[id]
/send → /send/new → /send/write → /send/takeoff/[id] → /send/share/[id] → /flights/[id]
/sill/[visit] → /sill/[visit]/reply → /sill/[visit]/takeoff → /flights/[id]
/flights/[id] → /flights/[id]/incident
/ → /birds/[id] → /birds/[id]/closet → /shop
/ → /more → /friends | /shoebox | /collection | /aviary | /earn | /settings
/ → /more → /more/report-bug
/b/[slug]  (public)      /join/[code]  (public)
```
