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
- Times are friendly and honest: "about 11:20 am", "in 12 minutes", "Fri 4 pm, roughly" for long trips.
- Errors are calm and say what to do next. "Not enough seeds. Deliveries pay 10 and up."
- Never blame the user. Never say "oops", "uh oh" or "whoops".
- The joke is always on the bird's dignity, never on the user and never on the recipient.
- Privacy lines are plain, not cute. "Your address is never stored or shown."

## Where the words are

| File | Holds |
|---|---|
| `config/copy/flight-log.json` | Flight log lines by event kind, with tokens |
| `config/copy/notifications.json` | Push and in-app notifications |
| `config/copy/sms.json` | Text messages and the share template |
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
sentence that needs it when there is none. `{speed}` "45 mph". `{eta}` "11:20 am".
`{distance}` "81 miles". `{duration}` "1h 48m". `{seeds}` a number.

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
