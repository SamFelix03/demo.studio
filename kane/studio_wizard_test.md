---
mode: testing
url: http://localhost:5173
max_steps: 24
timeout: 180
tags: [studio]
---

# Generate wizard Site through Launch

## Open generate
@import ./helpers/open_generate.md

## Site to Brief
Verify the wizard rail contains Site, Brief, Access, and Launch.
Click the button labeled Continue.
Verify the page contains "What Kane should demonstrate".
Verify a field labeled "What is this demo for?" is visible.
Verify the page contains "On-screen actions".
Verify the page contains "Create it free".
Verify the page contains "Add action".
Verify the page contains "Birthday RSVP".

## Brief to Access
Click the button labeled Continue.
Verify the page contains "Sign-in only if the demo needs it".
Verify a field labeled Username is visible.
Verify a field labeled Password is visible.
Verify the page contains "Leave blank for public pages".

## Access to Launch
Click only the button whose visible label is Continue. Do not click Generate demo. Do not press Enter.
Wait until the heading contains "Ready to record".
Verify the URL is still the generate page (no "/jobs/" in the path except the header).
Store the h2 panel title that contains "Ready to record" as 'launch_heading'.
Store the current URL as 'wizard_url'.
Verify the page contains "I have the right to record this URL".
Verify the page contains "Generate demo".
Verify the page contains "surveys.free".
Verify the page contains "Walkthrough".
Do not click Generate demo.

## Back stays in wizard
Click the button labeled Back.
Verify the page contains "Sign-in only if the demo needs it".
Do not click Generate demo.
