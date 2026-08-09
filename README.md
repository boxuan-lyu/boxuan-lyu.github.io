# Boxuan Lyu's homepage

A static personal academic homepage hosted with GitHub Pages.

## Visitor report

The homepage uses GoatCounter for privacy-aware visit collection. Aggregate
country totals are read through the Cloudflare Worker in `worker/`, so the
GoatCounter API token is never exposed to browser JavaScript.

To preview the visitor report with deterministic sample data, serve this
directory locally and open:

```text
http://127.0.0.1:8000/?visitor-demo=1#visitors
```

Worker deployment instructions are in `worker/README.md`.
