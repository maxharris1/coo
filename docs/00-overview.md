# 00. Overview

## The product in one paragraph

Coo is a messaging toy. You keep a small flock of pigeons. To message a friend you write a short
note, pick a bird and let it go. The bird flies the real distance to your friend at a real bird's
speed, on a real map, in real time. Around the block takes seconds. Brooklyn to Philadelphia takes
about two hours. Chicago takes two days and a night in a barn. Weather, daylight, the bird's mood
and its outfit change how the trip goes. The note always arrives. Sometimes late.

The tone is warm, silly and deadpan. It should feel like a sticker book, not a tech product.

## Who it is for, for now

Max and his friends, as a small, well-made toy. Later it should be good enough to pull people
from Roost and Carrier Pidge, two pigeon messaging apps that got popular in summer 2026.
Build for tens of users. Do not build anything that stops it reaching thousands.

## The core loop

1. **Write.** Pick a friend, write up to 140 characters, pick a bird. See distance, flight time
   and arrival odds.
2. **Release.** A 1.5 second takeoff. No take-backs.
3. **Watch.** The bird moves on a live map at any zoom, from one block to the whole country.
   A flight log fills with small jokes.
4. **Land.** The bird lands on the friend's sill. They get a notification and read the note.
5. **Reply.** The bird waits 30 minutes. A reply rides home on it for free. Otherwise it flies
   home empty. Either way it flies home in real time.
6. **Tend.** Feed, bathe and rest birds. Dress them for the weather. Earn seeds. Hatch more birds.

## What is in the first build

Everything below is in scope. Nothing here is "later".

- Phone number sign-in with a text code.
- A flock: two starter birds, up to five perches, eggs that hatch six fancy breeds.
- Notes: text only, 140 characters, 280 with the roomy leg tube.
- Real-time flights on a styled real map with one continuous zoom, day and night.
- Live weather at release and a forecast screen to pick a better hour or schedule a send.
- Arrival odds. Delays. Incident reports. Search parties.
- Homing: sill visits, free replies, real-time return flights.
- Sending to someone who is not a user, with a private link they can open without an account.
- Seeds: earned by deliveries, replies, new cities, a weekly punch card, odd jobs and found objects.
- A closet shared by the flock, 13 items for sale, saved outfits.
- Postmarks, badges, a shoebox of every note.
- Installable to the home screen. Push notifications. Text message fallback when a bird lands.
- Settings: notifications, quiet hours, units, per-friend location detail, travel switch, delete account.

## What is not in the first build

- Payments of any kind. Seeds cannot be bought.
- Photos, voice, group notes, read receipts, typing indicators, editing or unsending.
- Native apps. Languages other than English.
- Public profiles, discovery, or messaging anyone who is not a friend or a link recipient.

## Words used in this packet

| Word | Meaning |
|---|---|
| Loft | A user's home. Where their birds live and where birds for them land. |
| Roost | The point on a 200 metre grid nearest to a loft. The only location other people ever get. |
| Sill | Where a visiting bird waits after delivering. Also the tab that lists them. |
| Flight | One trip by one bird: a delivery or a return. |
| Visit | A bird sitting on someone's sill for up to 30 minutes after a delivery. |
| Plan | The stored, complete timeline of a flight, computed once at release. |
| Seeds | The only currency. Earned by playing. |
| Guest link | A private web address that lets a non-user watch a flight and read its note. |
| Tick | The once-a-minute server job that moves the world forward. |

## Screen map

Reference images are in `reference/screens/png/`. Routes and behaviour are in `docs/07-screens.md`.

- Onboarding: Welcome, Install, plus sign-in screens that are specified but not drawn.
- Tabs: Loft (Main), Flights, Send (centre button), Sill, Seeds (Shop).
- Sending: Recipients, NewRecipient, Compose, Forecast, Takeoff, ShareLink.
- Tracking: Flight (regional), FlightBlock (street), FlightLong (interstate, night), Lost (incident).
- Receiving: Landed, Reply, TakeoffHome.
- Flock: Pigeon, Wardrobe, Aviary.
- Post office (More): Friends, Shoebox, Collections, Earn, Settings.
- Public: Guest, GuestClaim.
