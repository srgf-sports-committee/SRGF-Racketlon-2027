# SRGF Racketlon 2027

## GitHub Pages files

- `index.html` — Home
- `fixtures.html` — Fixtures; Admin/Writer can enter results
- `results.html` — Results
- `teams.html` — Teams
- `players.html` — Players
- `auction.html` — Admin-only Auction
- `css/srgf.css` — shared styling
- `js/` — shared and page JavaScript
- `data/` — JSON fallback/public snapshot
- `Apps_Script_SRGF_Racketlon_2027.gs` — Google Apps Script backend
- `.github/workflows/sync-data.yml` — scheduled JSON sync

## Google Sheet

The master spreadsheet ID is configured in `js/config.js` and Apps Script.

Required sheets:

`PLAYERS`, `TEAMS`, `AUCTION`, `FIXTURES`, `RESULTS`, `CONFIG`, `ACCESS`

## ACCESS sheet

Use:

| Email | Role | Active |
|---|---|---|
| admin@gmail.com | ADMIN | TRUE |
| writer@gmail.com | WRITER | TRUE |

Anyone not listed is a read-only normal user.

## Google login

Set `GOOGLE_CLIENT_ID` in `js/config.js` to the Google OAuth Web Client ID.

Public visitors do not need to log in. Admin/Writer users use the Login button.

## Important

1. Deploy the Apps Script as a web app.
2. Replace the Apps Script URL in `js/config.js` if the deployment URL changes.
3. Add the GitHub Pages origin to the Google OAuth client's authorized JavaScript origins.
4. Enable the GitHub Action after pushing the repository. The workflow runs in GitHub's cloud, so your laptop does not need to be on.
5. The workflow writes `data/last-update.json` only after a successful Apps Script data read and successful JSON generation.
6. Public/report pages read the JSON snapshots directly. If a later sync fails, the last successful JSON remains in place.
7. The website shows the age of the last successful JSON update: green when fresh, orange after 2 minutes, and red after 5 minutes.
8. GitHub's scheduler is configured for every 5 minutes, but scheduled jobs can be delayed; the on-screen timestamp is the authoritative freshness indicator.
9. The JSON files are the public data snapshots. Apps Script remains the secure live backend for login and Admin/Writer writes.
