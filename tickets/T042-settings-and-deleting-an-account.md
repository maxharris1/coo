# T042. Settings and deleting an account

Phase: 5 Settings, safety and polish  
Depends on: T028, T041

## Goal

People control notifications, privacy and their data.

## Read first

- `docs/07-screens.md (Settings, Travel sheet)`
- `docs/06-api.md (settings, account)`
- `docs/03-data-model.md (Deleting an account)`
- `docs/12-security-privacy.md`

## Looks like

- `reference/screens/png/Settings.png` (and the `.html` beside it in `html/`)

## Build

- The Settings screen: notification switches, quiet hours, SMS fallback, default sharing level, travel switch, units, name, home-screen status, attribution lines, privacy and terms links, sign out, delete account.
- `DELETE /api/account` with the steps in docs/03, using the Supabase admin API to remove the auth user.
- Draft `/privacy` and `/terms` pages from docs/12 'Pages to write', marked as drafts for a person to approve.

## Done when

- [ ] Changing units changes distances everywhere after the next sync.
- [ ] Deleting an account sends visiting birds home first, removes the user's rows (the schema test's cascade), and leaves friends' data intact.
- [ ] Delete requires typing the handle; a wrong one is `invalid`.
- [ ] The screen matches `reference/screens/png/Settings.png`.
- [ ] Type check, lint and the whole test suite pass.
