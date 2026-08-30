---
mode: testing
url: http://localhost:5173
max_steps: 20
timeout: 180
tags: [studio, smoke]
---

# Demo Gallery and job detail

## Open generate
@import ./helpers/open_generate.md

## Open gallery
Click Demo Gallery in the header.
Verify the URL contains "/jobs".
Verify the page contains "Demo Gallery".
Store the visible Demo Gallery heading as 'gallery_heading'.
Verify the page contains "Library".
Verify the page contains "Kane" or "No demos yet".

## Open a job if one exists
```yaml
optional: true
```
If a demo tile is visible, click the first tile.
While still on that job page, verify the URL contains "/jobs/" followed by an id (not only "/jobs").
Verify the page contains "Kane CLI" or "Run console" or "Chrome slot".
Do not cancel a running job.
After those checks, click Demo Gallery in the header to return to the list.
Do not assert a job-id URL after leaving the job page.
Do not click Generate demo.
