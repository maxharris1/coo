# 15. Open items

## A person has to do these

| # | Item | Why | When |
|---|---|---|---|
| 1 | Pick the name and buy the domain | `docs/16-names.md`. Everything reads `config/app.json` | Before inviting friends |
| 2 | Create the Supabase project and the Vercel project | Accounts and billing | Before T008 |
| 3 | Create a Twilio account; connect it to Supabase Auth for sign-in codes | Phone sign-in cannot work without it | Before T008 can be tried for real |
| 4 | Register a sending number for landing texts (US 10DLC or verified toll-free) | US carriers block unregistered app texts. Takes days to weeks | Start early. The app works without it |
| 5 | Generate VAPID keys and set the env vars | Push | T027 |
| 6 | Store the tick URL and secret in Supabase Vault, apply `0002_cron.sql` | The minute tick | T029 |
| 7 | Read and approve the privacy page and terms | An agent can draft; a person must own it | Before inviting friends |
| 8 | Look at the map style on a real phone and say when it is right | Taste | T048 |
| 9 | Add the app to a phone's home screen and check a push arrives | Only a real iPhone proves it | T027 |

## Costs to expect for a friends test

Supabase free tier and Vercel Hobby are enough, because the minute tick runs from Supabase.
Twilio is pay-as-you-go: a small fee per text and a monthly fee for the number. OpenFreeMap,
Photon and Open-Meteo are free at this size. Check each provider's current pricing; none of
these figures were verified for this packet.

## Not verified in this packet

| Thing | Risk | Ticket that settles it |
|---|---|---|
| The map style against live tiles | Layers may draw nothing until source names and fonts are fixed | T048 (T016 may use the stock style meanwhile) |
| `0002_cron.sql` | Function and view names may differ from current Supabase | T029 |
| Open-Meteo request and response fields | Written from memory | T013 |
| Photon request and response fields | Written from memory | T010 |
| Twilio and web push details | Written from memory | T027, T028 |
| iOS behaviour: install detection, push permission, subscriptions dropping | Changes between iOS versions | T025, T027 |
| The `<Bird>` component port | The Python rig is the reference; the port is new work | T003 |
| Performance of animated SVG birds in long lists on old phones | Unknown | T044: fall back to static poses in lists if needed |

## Design choices to watch in the friends test

1. **Two birds and real-time returns.** A note to Chicago takes a bird away for about three days,
   out and back. With two birds that is half the flock. If friends feel stuck, the levers are in
   `config/game.json`: first egg sooner (`eggs.firstAtDeliveries`), three starter birds, or a
   faster trip home. Do not change them before watching real use.
2. **Odds.** A starter bird is delayed about 1 flight in 11 (1 in 17 with the lucky band). If delays feel like a bug rather than
   a joke, raise `oddsBase`.
3. **Seeds.** A user who sends three notes a day earns roughly 300 to 350 seeds a week with the
   punch card and a few replies: two or three items of gear. Tune prices after a week of real data from `seed_ledger`.
4. **One of each gear item.** Makes dressing a choice. May annoy. A second copy could be sold later.
5. **Block-level location by default.** Friends see your neighbourhood roost. Watch for anyone
   uncomfortable; the per-friend City switch and "use my town centre" exist for that.
6. **Guest flights start at the sender's roost** and the guest sees it on the map.
7. **Mock numbers are examples.** "4 of 5 perches", "Fifth perch 400", "23 notes" and so on show
   layout. Rules and prices come from `config/`.

## Changes made to things shown in the mocks

- Captain's cap: was "Steadier over open water", now "Steadier in a headwind". The mocks were updated to match.
- Party hat: was "Birthday notes pay double", now "Weekend deliveries pay 5 extra". The mocks were updated to match.
- Links: `[domain]/b/gerald-7QK4` → a 16 character token. `[domain]/join/max` → `max-` plus a random suffix.
- Friends screen "Pending" row for a link: kept, driven by guest links not yet claimed.
- Tiny backpack: listed, not for sale.

## Deliberately left for later

Photos (the backpack), group notes, a second copy of gear, selling seeds, native apps, other
languages, an admin screen for reports, data export, self-hosted tiles and geocoder.
