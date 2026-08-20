---
mode: testing
url: http://localhost:5173
max_steps: 18
timeout: 90
tags: [studio, smoke]
---

# Studio smoke: landing, brief actions, gallery

## Open studio
@import ./helpers/open_generate.md

## Landing copy
Verify the page contains "demo.studio".
Verify Kane CLI is mentioned.
Verify the Website URL field contains "surveys.free".
Verify the Product name field contains "surveys.free".

## Brief lists the default walkthrough
Click the button labeled Continue.
Verify the page contains "On-screen actions".
Verify the page contains "Create it free".
Verify the page contains "What Kane should demonstrate".

## Gallery
Click Demo Gallery.
Verify the URL contains "/jobs".
Verify the page contains "Demo Gallery".
