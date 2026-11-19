# T028. Text message fallback

Phase: 2 Install and notifications  
Depends on: T027

## Goal

People without push still hear that a bird landed.

## Read first

- `docs/10-notifications.md (Text messages)`

## Build

- The Twilio adapter behind the `Sms` port using `fetch`. Read Twilio's current Messages API docs.
- The fallback rule in `deliver()`: no push sent, kind allows SMS, `sms_fallback` on, not quiet hours, at most one per 15 minutes.
- Opt-out handling: an unsubscribed-recipient error turns `sms_fallback` off.
- 'Not now. Text me when birds land instead.' on the Install screen keeps the fallback on and skips install.

## Done when

- [ ] With `FakeSms`: a user with no subscriptions gets one text for `landed-in`, under 160 characters, ending with the stop line.
- [ ] A user with a working push gets no text.
- [ ] Two landings inside 15 minutes produce one text.
- [ ] `hungry` and `delayed` never produce a text.
- [ ] An unsubscribed error turns the setting off and nothing more is sent.
- [ ] No text contains a note body.
- [ ] Type check, lint and the whole test suite pass.
