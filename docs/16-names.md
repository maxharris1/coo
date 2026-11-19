# 16. The name

The app is built as **Coo**, tagline "Messages, eventually." The name appears in exactly one
place, `config/app.json` (`name`, `shortName`, `domain`), and the build writes it into the
manifest, page titles, texts and the logo component. The logo is the word set in Bagel Fat One,
so a new name needs no new artwork. The app icon is a pigeon and has no letters.

## Why look at alternatives

A quick web search while writing this packet found the name already in use by other apps:

- "Coo", a messaging app for parents (2016): https://www.trendhunter.com/trends/coo-parenting-app
- "Coo: Secret Messages" on Google Play: https://play.google.com/store/apps/developer?id=yunchan
- "CooMeet", a video chat app: https://apps.apple.com/us/app/coomeet/id1459611740

There is also Koo, a well-known Indian social network, which sounds the same. None of this
stops a toy for friends. It matters if the plan is to grow.

**Nothing below has been checked for trademarks, app store listings or domain availability.**
That is the first thing to do with any name you like.

## Suggestions

| Name | Tagline it suggests | For | Against |
|---|---|---|---|
| **Homing** | "Messages that know the way." | Says what it is. Real pigeon word. Warm | Common word; domain will be hard |
| **Cher Ami** | "Dear friend, by pigeon." | Name of the most famous messenger pigeon; means "dear friend" | Spelling and pronunciation for some |
| **Squab** | "Small messages. Slow birds." | Funny, short, ownable. A squab is a young pigeon | Also a menu item |
| **By Pigeon** | "Sent by pigeon." | Becomes a phrase: "I sent it by pigeon" | Two words |
| **Eventually** | "Messages, eventually." | The tagline is already the best line in the app | Abstract. Hard to search |
| **Sill** | "Something landed on your sill." | Short, soft, about receiving | Says nothing about birds |
| **Flap** | "Worth the flap." | Short, silly, a verb | Slightly negative ("in a flap") |
| **Gerald** | "Gerald has your message." | Names the app after the bird. Memorable. Very on tone | Confusing when your bird is called Brenda |
| **Breadcrumbs** | "He'll get there. There were breadcrumbs." | Explains every delay | Long. A web navigation term |
| **Winged It** | "Sent. Sort of." | Honest about arrival odds | Pun fatigue |

## A recommendation

If the aim is a name people repeat: **By Pigeon** or **Homing**. If the aim is to make friends
laugh when the text arrives: **Gerald**. Keeping **Coo** is fine for the friends test. Decide
before buying a domain or registering a sending number for texts, because both carry the name.

## Changing it

1. Edit `config/app.json`.
2. Rebuild. Check the manifest name, the Hello screen, a push notification, a landing text and the share text.
3. Move the domain: Vercel project, Supabase Auth redirect URLs, the tick URL in Supabase Vault.
