# SRGF Racketlon 2027 — Cloud JSON Sync

This setup makes the public report pages read from JSON files stored in GitHub. The JSON files are refreshed by GitHub Actions from the Google Sheet through Apps Script.

## What runs in the cloud

- Your laptop does **not** need to stay on.
- GitHub Actions attempts a sync every 5 minutes.
- A successful run updates the JSON files and `data/last-update.json`.
- Public pages read the JSON files directly.
- The website shows the age of the last successful JSON sync.
- At 5 minutes the indicator becomes orange; at 10 minutes it becomes red.
- The website keeps the last good JSON if a later sync fails.

## One-time setup

1. Upload/commit the included `.github/workflows/sync-data.yml` and `.github/workflows/check-data-freshness.yml`.
2. Make sure GitHub Actions is enabled for the repository.
3. Open **GitHub → Actions → Sync SRGF data → Run workflow** once to perform the first sync immediately.
4. Wait for the workflow to finish successfully.
5. Confirm that these files appear/update in `data/`:
   - `players.json`
   - `teams.json`
   - `fixtures.json`
   - `results.json`
   - `auction.json`
   - `config.json`
   - `last-update.json`
6. Open the public site and confirm the header shows `🟢 Data updated ...`.

## Important

GitHub Actions scheduling is not guaranteed to execute at an exact second. The workflow is intentionally set to a 5-minute schedule. The website displays the **actual successful sync time**, so you can see whether the data is fresh.

## If the sync fails

The existing JSON files are not replaced by blank/error data. The public site continues showing the last successful snapshot and the freshness indicator changes color as the snapshot becomes old.

The freshness-check workflow fails if the JSON snapshot becomes more than 10 minutes old. If GitHub notifications are enabled for the repository, that failed workflow can also appear in your GitHub notifications.
