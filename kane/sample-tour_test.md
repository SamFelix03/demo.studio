---
mode: action
url: http://localhost:4173
max_steps: 20
tags: [sample]
---

# Northbeam sample tour

## Dismiss blockers
```yaml
optional: true
```
@import ./helpers/dismiss_chrome.md

## Open homepage
Open http://localhost:4173.
Verify a heading containing "conversion" is visible.

## Open features
Click the Features link in the header nav.
Verify the URL contains "/features".
Verify a heading containing "Features" is visible.

## Open pricing
Click the Pricing link in the header nav.
Verify the URL contains "/pricing".
Verify text "Business" is visible.
