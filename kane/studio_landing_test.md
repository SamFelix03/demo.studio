---
mode: testing
url: http://localhost:5173
max_steps: 16
timeout: 90
tags: [studio, smoke]
---

# Studio landing and branding

## Open generate
@import ./helpers/open_generate.md

## Branding
Verify the heading "demo.studio" is visible.
Verify the page contains "Powered by".
Verify the page contains "Kane CLI".
Verify the page contains "Kane is the hands".
Verify the header contains "Demo Gallery".
Verify the header contains "Generate".

## Site step defaults
Verify the page contains "The site You Want to Demo".
Verify a field labeled Website URL is visible.
Verify the Website URL field contains "surveys.free".
Verify a field labeled Product name is visible.
Verify the Product name field contains "surveys.free".
Verify a Continue button is visible.
Do not click Continue.
Do not click Generate demo.
