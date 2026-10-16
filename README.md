[README.md](https://github.com/user-attachments/files/33574148/README.md)
# FeedTripwire — proof of concept (16 Oct 2026)

This is a working **browser-only proof of concept**, not a commercial product or ready-to-install WooCommerce app.

## What it does
- Loads two CSV or TSV supplier product snapshots (original and newest) in the browser.
- Aligns records by SKU/ID, independently of row position.
- Flags missing product IDs, duplicate IDs, removed SKUs, blanked values, large price drops, stock drops to zero, and availability transitions.
- Raises a high-priority warning when at least 30% and 2 or more original SKUs disappeared, or at least 30% and 2 or more SKUs changed to out of stock.
- Displays findings and exports them as a CSV report.
- Contains a demo dataset to try the UI without personal data.

## What it does NOT do
- No XML, APIs, live supplier URL monitoring, automatic import protection, notifications, integrations, subscriptions or AI.
- It does not prove that an import is correct, nor verify file link/image availability.
- SKU must be stable and unique. Thresholds are illustrative, and actual suppliers may use different schemas.
- Rows with empty/duplicate IDs are flagged and skipped; therefore their changes are not reliably matched.
- It is not hardened for massive or malicious files: 10 MB/client file maximum through the UI.

## Run it
Open `index.html` in any modern browser, or deploy the folder unchanged to GitHub Pages. Click **Try realistic demo** or choose both files. For GitHub Pages: create a public repository, upload `index.html` and `core.js` to its root, and enable Pages in Settings → Pages → Deploy from branch/main/root. Never put real private supplier files in the public repo. Uploaded files stay on the user's device in the deployed page.

Run logic tests: `node test-core.js`.

## Product hypothesis
Target: small WooCommerce stores and agencies that import supplier CSV/XML feeds. Offer independent, read-only **pre-import anomaly detection** that works alongside (not replacing) existing importers.

Potential later offer (only after validation): scheduled ingestion of authorized suppliers' feeds, user-defined thresholds, alerts, history; subscription perhaps US$19–39/month. Price point is a hypothesis to test, not proven willingness to pay.

## Validation (no budget)
1. Ask 15–20 operators who handle supplier imports what went wrong in their *last* import and what they currently do to detect it.
2. Offer to compare two redacted snapshots and discuss any concrete issues found; avoid uploading proprietary files without permission.
3. Success checkpoint: 3 operators confirm this specific problem and 2 volunteer to pilot a follow-up monitor with explicit pricing feedback. Prefer a paid pilot before building the hosted service.
4. Stop/pivot if the target group already has reliable guards integrated into their import stack or does not find the report valuable.

## Security considerations before hosting URL monitors
- Do not build a naive URL fetcher; SSRF is a real risk. Restrict schemes, reject loopback/private/reserved addresses, protect redirect and DNS-rebinding behavior.
- Obtain supplier authorization to poll feeds and honor rate limits.
- Encrypt secrets in storage, enforce user isolation and retention limits, secure alerts.
- Never claim a feed is 'safe' or that detected changes are necessarily erroneous; require a human decision on potential destructive imports.

Research checkpoints: official WooCommerce importer and troubleshooting docs; existing supplier sync tools in WordPress plugin directory; firsthand WooCommerce posts on Reddit from Apr and Oct 2026. See sourced analysis in accompanying ChatGPT answer.
