# GSC slices supplied with task 00442915

These files are evidence captures, not a joined dataset. Each file keeps its own
metadata and they are deliberately **not** merged.

| File                                          | What it is                                      | Period                 | Property                             | Search type           | Merge         |
| --------------------------------------------- | ----------------------------------------------- | ---------------------- | ------------------------------------ | --------------------- | ------------- |
| `gsc-daily-window-2026-10-21_2026-11-17.json` | aggregated 28-day totals plus two 14-day halves | 2026-10-21..2026-11-17 | stated by task, unverified in export | `web`, stated by task | baseline only |
| `gsc-top-pages-unattributed.json`             | top pages, no metadata                          | unknown                | unknown                              | unknown               | no            |
| `gsc-top-countries-unattributed.json`         | top countries, no metadata                      | unknown                | unknown                              | unknown               | no            |

The listed top-page rows sum to 178 impressions, more than the 167 impressions
reported for the entire daily slice. They therefore cannot be the same
slice. The test suite asserts this non-compatibility so the files cannot be
accidentally added together.

To replace these captures with a real API slice, run the read-only sync on the
Search Console connection and keep the new `search_analytics_slice_meta`
snapshot (property, dates, search type, dimensions, row count, retrieval time)
together with the raw `search_analytics` snapshot.
