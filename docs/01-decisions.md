# 01. Decisions

Decisions Max made. Treat them as fixed. Each one names where it shows up.

| # | Question | Decision | Where it lands |
|---|---|---|---|
| 1 | Who builds it | AI coding agents, small ordered tickets with tests | `tickets/`, `AGENTS.md` |
| 2 | Stack | Next.js, Supabase, Vercel | `docs/02` |
| 3 | Sign-in | Phone number and a text code | `docs/02`, T008 |
| 4 | Look | Sticker book: thick ink outlines, flat colour, hard shadows | `docs/08` |
| 5 | Gear | One closet shared by the whole flock | `docs/04` |
| 6 | Preflight | None. A 1.5 second goofy takeoff, then the tracker | `docs/07` |
| 7 | Map | Real map data, restyled to match the art, one continuous zoom | `docs/09` |
| 8 | Sending to a non-user | Sender picks the destination. A private link goes by text. The recipient can read without an account; making one links the note and the friendship | `docs/11` |
| 9 | Lost notes | Never. Only late | `docs/04`, `docs/05` |
| 10 | Scope of first build | Everything: weather and forecast, odd jobs and found objects, eggs and breeds, postmarks and badges | `docs/00` |
| 11 | Homing | Light touch. A bird waits 30 minutes on the sill. A reply rides home free | `docs/04` |
| 12 | Return trip | Real time, same rules as the trip out | `docs/04` |
| 13 | Starting flock | Two birds. The first egg hatches after 5 deliveries | `docs/04` |
| 14 | Notes | Text, a finger doodle, or both. Text is 140 characters, 280 with the roomy tube. A doodle is the same size for every bird (revised 2026-11-22, see below) | `docs/04` |
| 15 | No push available | Send a text message when a bird lands | `docs/10` |
| 16 | Location | Block level for all friends by default: the nearest roost, never an address. A friend can be turned down to city level | `docs/12` |
| 17 | Loft | Fixed home loft, with a travel switch | `docs/04` |
| 18 | Payments | None | `docs/00` |
| 19 | Name | Build as "Coo". Name and domain in one config file. Alternatives suggested | `config/app.json`, `docs/16` |
| 20 | Handoff | A repo-ready folder, zipped | this packet |
| 21 | First users | Max's friends | `docs/00` |

Max overruled the first Decision 14 ("Text only") on 2026-11-22 at 10:00 AM ET. Notes may now
carry a finger doodle as well as, or instead of, text. Text limits are unchanged.

## Defaults chosen without asking

Max was told these would be assumed. Change them in `config/` if he disagrees.

- English only. Miles by default, kilometres as a setting.
- Phone layout. On a wide screen the app sits in a centred 430 px column on the paper colour.
- Messaging only between friends, or by a link the sender made. Links are rate limited and can be reported.
- Picking from the phone's contacts is offered only where the browser supports it (Chrome on Android). Everywhere else you type a name.
- Animation is SVG and CSS, as in the asset pack. No animation library.
- A test clock that can skip time, off in production.

## Decisions made while writing this packet

These fill gaps. They are reasonable, not sacred. They are also listed in `docs/15-open-items.md`
so Max can overrule them.

- A new closet starts with the ankle bell and the bow tie. A new account starts with 60 seeds and 3 perches. Perch 4 costs 250, perch 5 costs 400.
- One of each gear item per closet. An item worn by a bird that is away is away with it.
- The tiny backpack (photos) is shown as "Coming later" and cannot be bought.
- The captain's cap helps in headwinds (an earlier mock said "open water", which would need coastline data).
- The party hat pays 5 extra on weekend deliveries (an earlier mock said "birthday notes", and there are no birthdays).
- A Pouter "carries two notes" by doubling the character limit, shown as a second card.
- Deliveries pay in full for the first 10 each day, then 2 seeds each, so two neighbours cannot farm seeds.
- Eggs hatch on a delivery count, not a timer: the first at 5 deliveries, then one every 25.
- Birds have a pronoun (he, she, they) chosen when they are named, because the copy uses one.
- Guest links carry a 16 character secret. The short code in the mock (`gerald-7QK4`) was illustrative.
- Invite links carry a random suffix and can be reset. Opening one makes you friends at once.
- The once-a-minute job is run by Supabase, not Vercel, because Vercel's free plan only allows daily cron jobs.
