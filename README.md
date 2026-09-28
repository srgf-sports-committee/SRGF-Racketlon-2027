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
4. Enable the GitHub Action after pushing the repository.
5. The JSON files are fallback/public snapshots; live Apps Script data is authoritative whenever it can be read.


### Loading strategy
Public pages load the latest GitHub JSON snapshot first so users immediately see the last good data. A live Apps Script refresh then runs in the background. Automatic refresh is every 30 minutes; the manual refresh button can still be used at any time. If the live request fails, the displayed JSON data is kept and is never replaced with blank data. GitHub Actions continues to update the JSON snapshots independently.
