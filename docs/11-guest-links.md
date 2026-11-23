# 11. Sending to someone who is not on Coo

The way Coo spreads: you send a real pigeon to a friend who has never heard of it.

A guest link carries a note on a bird already flying. An invite code (`/join/[code]`) only invites someone to keep a pigeon and become friends.

## The flow

1. **Sender** taps "Someone new" (or a contact, on Android), types a name and picks where the
   bird should fly: a neighbourhood, a city or an address. The place is snapped to the roost grid.
   A map opens there with a pin the sender can drag or tap onto the right block. The pin settles
   on the roost grid. See "Where the bird lands" below.
2. Sender writes the note and releases a bird, exactly as for a friend.
3. The server creates a guest link and returns its address once. The ShareLink screen offers
   "Text it to Maya", Copy and Share. **Our server does not text the recipient.** The sender
   sends the link from their own phone. That keeps it personal and keeps us out of spam law.
4. **Recipient** taps the link. No account, no app. They see the Guest page: who sent it, the
   bird, the live map, "Lands this afternoon", and "Your note is sealed. It opens the moment Gerald
   lands." The lede gives the leave time as a time of day: a scheduled flight "leaves Brooklyn
   this evening" (live voice), and a flight that has left "left Brooklyn this morning" or "left
   Brooklyn yesterday evening" (past voice). See `docs/14-content-voice.md`.
   They can leave a phone number for one text when it lands.
5. When the bird lands the page becomes GuestClaim: the note, the trip summary, and
   "Send Gerald home with a reply": name and phone number, "Make my loft".
6. Making a loft signs them up (text code), gives them two birds, makes them friends with the
   sender, and puts the note in their shoebox. If the bird is still on the sill they go straight
   to the Reply screen.

## The link

- Address: `https://{domain}/b/{bird-name}-{token}`. Example: `/b/gerald-k3Hq9ZtB2mXw7PaL`.
  The bird's name is decoration. The token is 16 characters from `[A-Za-z0-9]`, made with a
  cryptographic random source: about 95 bits.
- Stored as `sha256(LINK_TOKEN_PEPPER + token)` in `guest_links.token_hash`. The token is
  returned in the response to `POST /api/flights` and never again.
- Parsing: take the text after the last hyphen.
- Pages under `/b/` send `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex` and load no
  third-party scripts. The map tiles are the only outside request.

## What a guest can see

Before landing: sender's first name, the bird's name and looks, the route from the sender's
roost label to the destination label, the live position. Not the note.

After landing: the note. Nothing else about the sender.

The route's origin is the sender's roost, a point on a 200 metre grid labelled with a
neighbourhood. The sender chose to send a bird to this person, and the screen where they do it
says "They can watch the flight", so this is consented. It is noted in `docs/12-security-privacy.md`.

## Where the bird lands

The sender's pin is a provisional sill for a person, not an exact destination.
`/send/new` snaps it to the roost grid (`snap()` in `lib/game/privacy.ts`, about 200 metres),
and `legFor` snaps it again on the server. It is stored snapped in `guest_links.dest_*` and
`flights.to_*`, labelled with the neighbourhood or city the geocoder names for the snapped point.
It is never a street, a house number or the text the sender typed. If the sender does not move
the pin, the bird flies to the held place's snapped roost under that place's label.

The recipient's own roost replaces the guess. When they sign up from the link, the loft step
opens at the flight's destination (see Claiming). "This is home" with the pin unmoved saves that
point as their roost. If they use their location, pick a different place, move the pin or choose
their town centre, `profiles.home_*` holds their own snapped roost instead of the sender's guess. A later
`POST /api/loft` replaces it the same way. Sends between friends after that use their current loft.

A note already in the air keeps its destination. Claiming the link and `setLoft` never retarget
a flying guest delivery. `flights.to_*`, `guest_links.dest_*`, the plan and `arrive_at` stay as
sent. The bird lands at the provisional sill, and the flight home starts from that stored
destination.

## Timing rules

- The bird flies in real time whether or not the link has been opened.
- After landing it waits 30 minutes like any visit, then flies home empty.
- At landing, `expires_at` is set to 7 days later. Until then the link shows the note.
- If the link was never opened by then: it expires, `notes.returned_at` is set, and the sender
  is told "Your note to Maya came back". The note stays in the sender's shoebox.
- If it was opened but not claimed, it also expires at 7 days and shows the expired page.

## Claiming

`POST /api/guest/[token]/claim`, signed in. In one transaction:

1. Lock the link. If `claimed` by this user: return success. If claimed by someone else,
   `expired` or `reported`: `gone`. If the claimer is the sender: `conflict`.
2. Set `status = 'claimed'`, `claimed_by`, `claimed_at`.
3. Set `notes.recipient_id` and `flights.counterpart_id` to the claimer.
4. Create the friendship (`via = 'guest_link'`) unless one exists. If it exists and is blocked,
   stop with `forbidden`.
5. If the visit is still `waiting`, set its `host_id` to the claimer.
6. Insert `bird_meetings`. Notify the sender `friend-joined`.

For a brand-new user, onboarding from a link is shorter: name and phone on the claim page,
the text code, the first-bird step, then the install step. The loft step is prefilled with the
link's destination ("Is this where birds should find you?") and can be changed, as "Where the
bird lands" describes.

An existing user who opens a link while signed in sees "Add to my sill" and claims in one tap.

### Leftover sends

Any path that makes two people friends resolves the leftover guest sends between them: claiming a
link, joining by invite code, and signing up with the phone a send was addressed to. Each path
claims every `active`, unexpired link between the pair, in either direction, in the same
transaction, with steps 2, 3, 5 and 6 above. A bird already in the air keeps its destination and
`arrive_at`; only who it is for changes. The sender's Pending row goes away, and the note stays
hidden from the recipient until `delivered_at`.

A link matches the pair when its `notify_phone` equals the other person's verified phone (through
`guest_links_for_phone`, never by the last 4), or, once the phone is cleared after landing, when
the pair is already friends and the link's `recipient_name` uniquely matches that friend's name.

- **Sign-up with the addressed phone.** Onboarding claims every send addressed to the new
  person's phone without opening the claim page. It creates the friendship
  (`via = 'guest_link'`) and notifies the sender `friend-joined`, as a claim does.
- **Invite code.** `joinByCode` claims the leftover links after it makes the friendship, and also
  when the pair is already friends, without an error.
- **Blocked.** A blocked pair resolves nothing. The claim still refuses with `forbidden`,
  `joinByCode` with `conflict`, and onboarding skips that sender.

## The landing text for guests

On the Guest page, "Text me when he lands" opens a field for a phone number with a checkbox:
"Send me one text when {bird} lands. Msg and data rates may apply. Reply STOP to end." With the box ticked, `POST /api/guest/[token]/notify`
stores the number. At landing we send one message (`guest-landed` in `config/copy/sms.json`)
and clear the number. Limit: one number per link, three attempts per link.

## Abuse controls

- 5 guest links per sender per day.
- A sender must have a finished profile with a verified phone number, which sign-in guarantees.
- The Guest page has a small "Report" link. A report sets the link to `reported`, hides the
  note and the flight from that address, and records the reason. Three reported links from one
  sender in 30 days stops that sender from making more until a person reviews
  (`select` on `reports`; there is no admin screen in the first build).
- Guest endpoints are rate limited per IP address (30 a minute) and return the same `not_found`
  for a wrong token as for a missing one.
