---
mode: testing
url: http://localhost:5173
max_steps: 16
timeout: 180
tags: [studio]
---

# Site step rejects an empty URL

## Open generate
@import ./helpers/open_generate.md

## Clear URL and continue
Select the Website URL field.
Delete all of its contents so the field is empty.
Click the button labeled Continue.
Verify the page still shows the Site step.
Verify the page contains "A website URL is required." or the Website URL field is still empty and Continue did not open the Brief step titled "What Kane should demonstrate".
Store the visible error text as 'url_required_message'.
Do not click Generate demo.
