# Tickets

48 tickets, in order. Do them top to bottom. A ticket may start when everything it depends on is done.
T048 (the map style) can be done any time after T016.

| Ticket | Title | Depends on |
|---|---|---|
| | **Phase 0 Foundation** | |
| [T001](T001-scaffold-the-app.md) | Scaffold the app | — |
| [T002](T002-tokens-fonts-and-base-components.md) | Tokens, fonts and base components | T001 |
| [T003](T003-the-bird-component.md) | The Bird component | T002 |
| [T004](T004-port-the-flight-engine.md) | Port the flight engine | T001 |
| [T005](T005-pure-game-rules.md) | Pure game rules | T004 |
| [T006](T006-database-layer-and-test-database.md) | Database layer and test database | T001 |
| [T007](T007-clock-ports-and-fakes.md) | Clock, ports and fakes | T006 |
| [T008](T008-phone-sign-in.md) | Phone sign-in | T007, T002 |
| [T009](T009-onboarding-profile-and-first-birds.md) | Onboarding: profile and first birds | T008, T005, T003 |
| [T010](T010-places-roosts-and-the-loft.md) | Places, roosts and the loft | T009 |
| [T011](T011-sync-and-the-loft-screen.md) | Sync and the loft screen | T010 |
| | **Phase 1 The core loop** | |
| [T012](T012-friends.md) | Friends | T011 |
| [T013](T013-weather.md) | Weather | T007 |
| [T014](T014-quotes-and-the-recipients-screen.md) | Quotes and the Recipients screen | T012, T013, T004 |
| [T015](T015-compose-release-and-takeoff.md) | Compose, release and takeoff | T014 |
| [T016](T016-the-map-and-the-tracker.md) | The map and the tracker | T015, T003 |
| [T017](T017-place-names-and-the-flight-log.md) | Place names and the flight log | T016, T010 |
| [T018](T018-the-tick-landing-deliveries.md) | The tick: landing deliveries | T015, T005 |
| [T019](T019-the-sill-and-the-landed-screen.md) | The sill and the Landed screen | T018 |
| [T020](T020-replies-and-the-trip-home.md) | Replies and the trip home | T019 |
| [T021](T021-the-flights-screen.md) | The Flights screen | T020 |
| [T022](T022-delays-incident-reports-and-search-parties.md) | Delays, incident reports and search parties | T021 |
| [T023](T023-forecast-and-scheduled-sends.md) | Forecast and scheduled sends | T022 |
| [T024](T024-several-recipients-at-once.md) | Several recipients at once | T023 |
| | **Phase 2 Install and notifications** | |
| [T025](T025-install-to-the-home-screen.md) | Install to the home screen | T011 |
| [T026](T026-in-app-notifications-and-the-realtime-nudge.md) | In-app notifications and the realtime nudge | T018 |
| [T027](T027-push-notifications.md) | Push notifications | T026, T025 |
| [T028](T028-text-message-fallback.md) | Text message fallback | T027 |
| [T029](T029-wire-the-minute-tick.md) | Wire the minute tick | T020, T022 |
| | **Phase 3 Guest links** | |
| [T030](T030-send-to-someone-new.md) | Send to someone new | T024, T017 |
| [T031](T031-the-guest-page.md) | The guest page | T030 |
| [T032](T032-claiming-a-link-and-expiry.md) | Claiming a link and expiry | T031 |
| | **Phase 4 Flock and economy** | |
| [T033](T033-the-pigeon-page-and-care.md) | The pigeon page and care | T020 |
| [T034](T034-the-closet.md) | The closet | T033 |
| [T035](T035-the-seed-store.md) | The seed store | T034 |
| [T036](T036-earning-the-punch-card-and-pay-table.md) | Earning: the punch card and pay table | T035 |
| [T037](T037-odd-jobs-and-found-objects.md) | Odd jobs and found objects | T036 |
| [T038](T038-postmarks-badges-and-birds-met.md) | Postmarks, badges and birds met | T022, T037 |
| [T039](T039-eggs-breeds-and-the-aviary.md) | Eggs, breeds and the aviary | T038 |
| [T040](T040-the-shoebox.md) | The shoebox | T020 |
| [T041](T041-the-post-office-menu.md) | The post office menu | T039, T040 |
| | **Phase 5 Settings, safety and polish** | |
| [T042](T042-settings-and-deleting-an-account.md) | Settings and deleting an account | T028, T041 |
| [T043](T043-limits-blocks-and-an-authorisation-audit.md) | Limits, blocks and an authorisation audit | T042, T032 |
| [T044](T044-empty-offline-and-error-states-accessibility-per.md) | Empty, offline and error states; accessibility; performance | T043 |
| [T045](T045-the-dev-panel-and-test-clock.md) | The dev panel and test clock | T022 |
| [T046](T046-end-to-end-journeys.md) | End-to-end journeys | T045, T044 |
| [T047](T047-deploy.md) | Deploy | T046, T029 |
| [T048](T048-finish-the-map-style.md) | Finish the map style | T016 |
