# Release log

Every theme push to a storefront goes through `scripts/release.sh` ([docs/releasing.md](docs/releasing.md)), which appends an entry under "Releases" after the push. Don't edit the entries by hand.

## Releases

### 2026-10-06 14:30 UTC · channel 1895766 (ReelFlies_CA) · ReelFlies CA

- Theme: ReelFlies 6.22.0, uuid `58abad50-a3c0-013f-e2b6-2ec98cc9ce73`
- Commit: `5d0d0cb8ca42405d8555de6a84f20843060d7cde` on `master`
- Bundle: `reelflies-ca-6.22.0-5d0d0cb.zip`, 10,940,174 B, sha256 `367071ace794697e59a36129ba4f958a2d27daf85aa9bf73411d42c6cfc763dc`
- main.js: 245,069 B
- Step 1: first release, replacing Cavio · variation "Natural" (theme 25121d00-dd0c-013d-4919-76cf528056e2)
- rf_* values pushed: none
- New switches: none
- Verify: the live saved settings match config.json
- Operator: Shaun Bathgate

### 2026-10-07 03:07 UTC · channel 1895766 (ReelFlies_CA) · ReelFlies CA

- Theme: ReelFlies 6.22.0, uuid `174ad580-a42a-013f-3c01-06627e5707c7`
- New uuid: yes; before the push the channel ran theme `58abad50-a3c0-013f-e2b6-2ec98cc9ce73`
- Commit: `a30586f5913f2ae391729c9fe0c05885e8712326` on `master`
- Bundle: `reelflies-ca-6.22.0-a30586f.zip`, 10,938,401 B, sha256 `5ae0f7917aa83549954f5f1c9a58bfe548820e9c6a4df4dd0bac77757c6ed1f2`
- main.js: 245,069 B
- Step 1: no differences from the live saved settings
- Changed in repo: none since `5d0d0cb`, the channel's last release
- rf_* values pushed: none
- New switches: none
- Verify: 1 problem(s): the live theme is "ReelFlies (1)", not "ReelFlies"
- Operator: Shaun Bathgate
- Confirmation: non-interactive (agent), `--confirm-nonprod 1895766`

### 2026-10-07 18:55 UTC · channel 1895766 (ReelFlies_CA) · ReelFlies CA

- Theme: ReelFlies 6.22.0, uuid `9781b9a0-a4ae-013f-3d64-06627e5707c7`
- New uuid: yes; before the push the channel ran theme `174ad580-a42a-013f-3c01-06627e5707c7`
- Commit: `3ee4c18b33c45d75e6f0a69a32d12a1ededf6330` on `master`
- Bundle: `reelflies-ca-6.22.0-3ee4c18.zip`, 11,345,813 B, sha256 `269b680f91946a424c498df7aefedb4b5517106a21b7df30a798edff7bd4f116`
- main.js: 246,426 B
- Step 1: no Theme Styles edits since the last release
- Changed in repo: `alert-color`, `banner--default-backgroundColor`, `blockquote-cite-font-color`, `body-font`, `button--default-borderColor`, `button--default-borderColorActive`, `button--default-borderColorHover`, `button--default-color`, `button--default-colorActive`, `button--default-colorHover`, `button--disabled-backgroundColor`, `button--disabled-color`, `button--icon-svg-color`, `button--primary-backgroundColor`, `button--primary-backgroundColorActive`, `button--primary-backgroundColorHover`, `card-figcaption-button-color`, `card-title-color`, `card-title-color-hover`, `carousel-arrow-color`, `carousel-arrow-color--hover`, `carousel-description-color`, `carousel-dot-color`, `carousel-dot-color-active`, `carousel-play-pause-button-textColor`, `carousel-play-pause-button-textColor--hover`, `carousel-title-color`, `checkRadio-borderColor`, `checkRadio-color`, `color_badge_product_sale_badges`, `color_badge_product_sold_out_badges`, `color_bg_featured_promotions`, `color_hover_product_sale_badges`, `color_hover_product_sold_out_badges`, `color_text_featured_promotions`, `color-coupon-pill-background`, `color-coupon-pill-border`, `color-coupon-pill-text`, `color-error`, `color-errorLight`, `color-grey`, `color-greyDark`, `color-greyDarker`, `color-greyDarkest`, `color-greyLight`, `color-greyLighter`, `color-greyLightest`, `color-greyMedium`, `color-info`, `color-infoLight`, `color-primary`, `color-primaryDark`, `color-primaryDarker`, `color-primaryLight`, `color-secondaryDark`, `color-secondaryDarker`, `color-success`, `color-successLight`, `color-textBase`, `color-textBase--active`, `color-textBase--hover`, `color-textHeading`, `color-textLink`, `color-textLink--active`, `color-textLink--hover`, `color-textSecondary`, `color-textSecondary--active`, `color-textSecondary--hover`, `color-warning`, `color-warningLight`, `color-whitesBase`, `container-border-global-color-base`, `container-fill-dark`, `default_image_brand`, `default_image_product`, `dropdown--quickSearch-backgroundColor`, `focusTooltip-backgroundColor`, `fontSize-root`, `form-label-font-color`, `headings-font`, `homepage_show_carousel`, `icon-color`, `icon-color-hover`, `icon-ratingEmpty`, `icon-ratingFull`, `input-border-color`, `input-border-color-active`, `input-font-color`, `label-backgroundColor`, `navPages-color`, `navPages-color-hover`, `navPages-subMenu-backgroundColor`, `navPages-subMenu-separatorColor`, `navUser-color`, `navUser-color-hover`, `navUser-dropdown-borderColor`, `navUser-indicator-backgroundColor`, `optimizedCheckout-buttonPrimary-backgroundColor`, `optimizedCheckout-buttonPrimary-backgroundColorActive`, `optimizedCheckout-buttonPrimary-backgroundColorDisabled`, `optimizedCheckout-buttonPrimary-backgroundColorHover`, `optimizedCheckout-buttonPrimary-borderColor`, `optimizedCheckout-buttonPrimary-font`, `optimizedCheckout-buttonSecondary-backgroundColorActive`, `optimizedCheckout-buttonSecondary-backgroundColorHover`, `optimizedCheckout-buttonSecondary-borderColor`, `optimizedCheckout-buttonSecondary-borderColorActive`, `optimizedCheckout-buttonSecondary-borderColorHover`, `optimizedCheckout-buttonSecondary-color`, `optimizedCheckout-buttonSecondary-colorActive`, `optimizedCheckout-buttonSecondary-colorHover`, `optimizedCheckout-buttonSecondary-font`, `optimizedCheckout-colorFocus`, `optimizedCheckout-contentPrimary-color`, `optimizedCheckout-contentPrimary-font`, `optimizedCheckout-contentSecondary-color`, `optimizedCheckout-contentSecondary-font`, `optimizedCheckout-discountBanner-backgroundColor`, `optimizedCheckout-discountBanner-iconColor`, `optimizedCheckout-discountBanner-textColor`, `optimizedCheckout-form-textColor`, `optimizedCheckout-formChecklist-backgroundColorSelected`, `optimizedCheckout-formChecklist-borderColor`, `optimizedCheckout-formChecklist-color`, `optimizedCheckout-formField-borderColor`, `optimizedCheckout-formField-errorColor`, `optimizedCheckout-formField-inputControlColor`, `optimizedCheckout-formField-placeholderColor`, `optimizedCheckout-formField-textColor`, `optimizedCheckout-header-borderColor`, `optimizedCheckout-header-textColor`, `optimizedCheckout-headingPrimary-color`, `optimizedCheckout-headingPrimary-font`, `optimizedCheckout-headingSecondary-color`, `optimizedCheckout-headingSecondary-font`, `optimizedCheckout-link-color`, `optimizedCheckout-link-font`, `optimizedCheckout-link-hoverColor`, `optimizedCheckout-loadingToaster-backgroundColor`, `optimizedCheckout-orderSummary-borderColor`, `optimizedCheckout-step-backgroundColor`, `optimizedCheckout-step-borderColor`, `overlay-backgroundColor`, `pace-progress-backgroundColor`, `select-arrow-color`, `shop_by_price_visibility`, `spinner-borderColor-dark`, `storeName-color` (since `a30586f`, the channel's last release)
- rf_* values pushed: `rf_cart_state` = true, `rf_menu_exclude_ids` = "", `rf_menu_species_root_id` = "", `rf_menu_type_ids` = "", `rf_price_unit_exclude` = "", `rf_quick_add` = true, `rf_region_prompt` = false, `rf_rise` = true, `rf_ship_expedited_from` = "", `rf_ship_free_threshold` = "60", `rf_ship_standard_rate` = "", `rf_store_same_as` = ""
- New switches: `rf_cart_state`, `rf_menu_exclude_ids`, `rf_price_unit_exclude`, `rf_quick_add`, `rf_region_prompt`, `rf_rise`, `rf_ship_expedited_from`, `rf_ship_free_threshold`, `rf_ship_standard_rate`, `rf_store_same_as`
- Verify: the live saved settings match config.json
- Lighthouse: pending host batch
- Operator: Shaun Bathgate
- Confirmation: non-interactive (agent), `--confirm-nonprod 1895766`

## Switch toggles

Log every module switch (`rf_*`) toggled in a storefront's Theme Styles here, one row per toggle, in this format. From T-14 to T+30, switch toggles and widget unpublishing are the only changes allowed, apart from P1 fixes through `scripts/release.sh` (SCOPE-3).

After a toggle, change `config.json` to match and commit it. Otherwise the next release stops on the difference (the release guard, ticket 15).

| Date | Channel | Switch | From | To | Who | Reason |
|---|---|---|---|---|---|---|

## My Themes

Every theme the release tooling deletes from My Themes, one row each, written by `scripts/release.sh`'s prune right after the deletion (W0-3, [docs/releasing.md](docs/releasing.md#pruning-my-themes)). The prune runs after each push, and on its own with `--prune-only`. It deletes only themes named ReelFlies that this file records as a release, active on no channel and not flagged `is_active` in My Themes, never the latest or previous release on 1895766 or channel 1, and always keeps the newest three. The commit and zip sha256 are the deleted build's, from its release entry. The operator is `git config user.name`, with "(no terminal)" when the prune ran without one, as an agent's does. Don't edit the rows by hand.

| Time (UTC) | Action | Theme uuid | Name and version | Commit | Zip sha256 | Operator |
|---|---|---|---|---|---|---|
