---
mode: testing
url: http://localhost:4031/health
max_steps: 12
timeout: 60
tags: [studio, smoke, api]
---

# API health endpoint

## Open health JSON
Open http://localhost:4031/health.
Verify the page contains "ok".
Verify the page contains "true".
Verify the page contains "database".
Verify the page contains "temporal".
Verify the page contains "7233" or "slots_free".
