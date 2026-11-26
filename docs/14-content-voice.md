# 14. Words and voice

## The five rules

From the Voice sheet (`reference/sheets/png/Voice.png`, `assets/copy/voice.md`):

1. **The bird is the hero.** Write about what the bird did, not what the system did.
   "Gerald delivered your note", not "Message delivered".
2. **Deadpan beats wacky.** State the absurd thing plainly, in short sentences.
   "Found a pretzel. Chose the pretzel."
3. **Nothing bad happens to a bird.** Late, distracted, asleep, sulking. Never hurt, never gone.
4. **Buttons say exactly what happens.** "Release Gerald", "Send a search party", "Text it to Maya".
5. **Numbers are real.** Miles, minutes and odds come from the flight, never from a joke.

## More rules for new text

- Short sentences. No exclamation marks. No emoji in the interface.
- Sentence case everywhere. Small caps labels (NOTE FROM PRIYA) are the only capitals.
- Use the bird's name and pronoun. Never "your pigeon" when a name is available.
- Live and quoted landing, leave and "home" times read as a time of day from `fuzzyWhen` in
  `src/lib/format.ts`, never a clock or a countdown: "should land this afternoon", "Home any
  minute now". "Any minute now" (live) and "shortly" (quote) cover 10 minutes or less. A
  sunrise leave is "first light". Logs, "Released", notification stamps, schedule chips and the
  sunset line keep their clocks. See "Times of day" below.
- Errors are calm and say what to do next. "Not enough seeds. Deliveries pay 10 and up."
- Never blame the user. Never say "oops", "uh oh" or "whoops".
- The joke is always on the bird's dignity, never on the user and never on the recipient.
- Privacy lines are plain, not cute. "Your address is never stored or shown."

## Times of day

`fuzzyWhen(atMs, nowMs, timeZone, voice)` picks a row by the local time of `atMs` and a column
by how many local days `atMs` is from `nowMs`. The live voice reads against the current time.
The quote voice reads against a fixed moment, such as the release, so the words do not change
after they are written. The past voice is for times already gone. In the live and quote voices,
a time 10 minutes or less from `nowMs` reads "any minute now" (live) or "shortly" (quote)
instead of a row. `{day}` is the weekday name, used up to six days either side. Further out, the
phrase is the date and the dated column: "Monday, December 7, in the afternoon".

| From | Today | Tomorrow | Weekday | Dated | Yesterday |
|---|---|---|---|---|---|
| midnight | overnight | overnight | overnight {day} | overnight | overnight yesterday |
| 5:00 am | early this morning | early tomorrow morning | early {day} morning | early in the morning | early yesterday morning |
| 8:00 am | this morning | tomorrow morning | {day} morning | in the morning | yesterday morning |
| 11:30 am | around midday | around midday tomorrow | around midday {day} | around midday | around midday yesterday |
| 1:30 pm | this afternoon | tomorrow afternoon | {day} afternoon | in the afternoon | yesterday afternoon |
| 5:00 pm | this evening | tomorrow evening | {day} evening | in the evening | yesterday evening |
| 8:00 pm | tonight | tomorrow night | {day} night | at night | last night |

## Where the words are

| File | Holds |
|---|---|
| `config/copy/flight-log.json` | Flight log lines by event kind, with tokens |
| `config/copy/notifications.json` | Push and in-app notifications |
| `config/copy/sms.json` | Text messages and the share template |
| `config/copy/shop.json` | Shop refusals shown as a toast |
| `config/jobs.json`, `found-objects.json`, `badges.json`, `quirks.json` | Their own text |
| `assets/copy/empty-states.json` | Empty and offline states |
| The screen mocks | Every label, button and helper line on drawn screens |
| `docs/07-screens.md` | Copy for undrawn screens |

Put interface strings in one module (`src/lib/copy.ts`) rather than scattered through
components, so a person can read and edit the whole voice in one place.

## Tokens

`{bird}` name. `{He}` `{he}` `{him}` `{his}` pronoun forms (for "they": They, they, them,
their, and use plural verbs where the line needs one; lines in the config are written to work
with all three). `{friend}` the other person's name. `{place}` a place name, or drop the
sentence that needs it when there is none. `{speed}` "45 mph". `{eta}` "this morning".
`{distance}` "81 miles". `{duration}` "1h 48m". `{seeds}` a number.

The incoming notification ends "Lands {eta}.", with `{eta}` fixed when the notification is
written, in the recipient's time zone, in the quote voice. The roost notice reads "Asleep near
{place}. Back in the air at first light." It has no sunrise token.

## Error messages by code

| Code | Default line |
|---|---|
| `insufficient_seeds` | Not enough seeds. Deliveries pay 10 and up. |
| `rate_limited` | That is a lot of pigeons. Try again in a bit. |
| `conflict` (bird not home) | {bird} is not home right now. |
| `conflict` (already on that job) | {bird} is already on that job. |
| `conflict` (too tired) | {bird} is too tired to fly. A nap fixes that. |
| `conflict` (visit over) | {bird} already went home. Send one of yours instead. |
| `conflict` (no perch) | No free perch. The egg can wait. |
| `forbidden` | You can only send birds to friends. |
| `gone` | That link has expired. The bird went home with the note. |
| `invalid` (note too long) | That will not fit on one leg. |
| `internal` | Something went sideways. Nothing was lost. Try again. |
| offline | You are offline. Birds keep flying. The map catches up when you are back. |
