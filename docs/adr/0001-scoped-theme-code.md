---
status: proposed
---

# ReelFlies code lives in its own folders; upstream Cornerstone files get only listed hooks

Stencil has no child themes, so the ReelFlies theme is a git fork of Cornerstone that merges each upstream release tag. To keep those merges cheap, ReelFlies code goes only in folders upstream doesn't have, and an upstream file changes only through a small hook (an import, an include, a registration, a guard) that is listed with its reason in [CUSTOMIZATIONS.md](../../CUSTOMIZATIONS.md). This replaces the category refactor plan's "Theme: no theme code changes" (refactor `map.md:36`), which assumed the storefront would run Cavio.

## Considered options

- **No theme code (Theme Styles and Page Builder only).** This can't deliver the launch fixes: explicit image parameters, buying-path guards and an inline add confirmation, the quick-search rewrite, the menu toggle as a button, and later quick add. Rejected.
- **Edit upstream files freely.** This is the fastest to write, but every Cornerstone release becomes a hand-merge across dozens of files, so in practice the fork stops taking releases. Rejected.
- **New folders plus listed hooks.** Chosen. Expect 15–20 touched upstream files, most of them by one or two lines.

## Consequences

- **Upgrades:** merge the new tag through `vendor/cornerstone` into an `upgrade/<tag>` branch, resolve conflicts at the listed hooks, run CI and compare screenshots, then merge to `master`. A conflict outside the list means a rule was broken.
- **Review:** a change to an upstream file without a CUSTOMIZATIONS.md entry is sent back.
- **Hero widget:** its template and schema live in BigCommerce (Widgets API), synced from `widgets/` by a script. That needs its own API account with Content: modify, created when the widget work starts, not the Stencil-CLI token.
- **Secrets:** theme settings are public. `templates/pages/account/add-payment-method.html:31` injects every theme setting into that page's JavaScript, so no token or key ever goes in a theme setting.
