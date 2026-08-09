# Visitor statistics proxy

This Cloudflare Worker exposes only aggregate visit totals by country. It keeps
the GoatCounter API token out of the static GitHub Pages site and caches each
reporting period for one hour.

## Deploy

1. Create a GoatCounter token with only **Read statistics** permission.
2. From this directory, save it as a Worker secret:

   ```sh
   wrangler secret put GOATCOUNTER_TOKEN
   ```

3. Deploy the Worker:

   ```sh
   wrangler deploy
   ```

4. Copy the resulting `/stats` URL into the `data-stats-endpoint` attribute on
   the `#visitors` section in `index.html`.

Do not put the token in `wrangler.jsonc`, Git, or browser JavaScript.
