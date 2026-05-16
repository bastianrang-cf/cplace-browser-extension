# Changelog

## [0.10.0](https://github.com/bastianrang-cf/cplace-browser-extension/compare/v0.9.1...v0.10.0) (2026-05-16)


### Features

* use SVG as default_icon and enable/disable per tab ([#47](https://github.com/bastianrang-cf/cplace-browser-extension/issues/47)) ([5b8f14a](https://github.com/bastianrang-cf/cplace-browser-extension/commit/5b8f14a9cfca40d15c73e6b9ccb35a99df29a839)), closes [#46](https://github.com/bastianrang-cf/cplace-browser-extension/issues/46)


### Bug Fixes

* **batch-jobs:** show workspace name from job title instead of tenant path ([#42](https://github.com/bastianrang-cf/cplace-browser-extension/issues/42)) ([58767b3](https://github.com/bastianrang-cf/cplace-browser-extension/commit/58767b39a8f78bc07785c8833c7ff68041e0d8e3)), closes [#41](https://github.com/bastianrang-cf/cplace-browser-extension/issues/41)

## [0.9.1](https://github.com/bastianrang-cf/cplace-browser-extension/compare/v0.9.0...v0.9.1) (2026-05-15)


### Bug Fixes

* **batch-jobs:** retitle overlay and enrich list rows ([#38](https://github.com/bastianrang-cf/cplace-browser-extension/issues/38)) ([85f2deb](https://github.com/bastianrang-cf/cplace-browser-extension/commit/85f2deb72a9bf6b80f9cf713f0d053ac428fb58f)), closes [#35](https://github.com/bastianrang-cf/cplace-browser-extension/issues/35)
* **system-info:** text adjustments for build info display ([#37](https://github.com/bastianrang-cf/cplace-browser-extension/issues/37)) ([c0e46e1](https://github.com/bastianrang-cf/cplace-browser-extension/commit/c0e46e14f90f3a2ab00dab29fe8455075c294fd0)), closes [#36](https://github.com/bastianrang-cf/cplace-browser-extension/issues/36)

## [0.9.0](https://github.com/bastianrang-cf/cplace-browser-extension/compare/v0.8.0...v0.9.0) (2026-05-15)


### Features

* add System Information module ([#33](https://github.com/bastianrang-cf/cplace-browser-extension/issues/33)) ([9c7b333](https://github.com/bastianrang-cf/cplace-browser-extension/commit/9c7b3337cae31d71d057acc21c12800f6dffc4c7))


### Bug Fixes

* **batch-jobs:** correct request shape and rewrite row parsing ([#32](https://github.com/bastianrang-cf/cplace-browser-extension/issues/32)) ([660a94b](https://github.com/bastianrang-cf/cplace-browser-extension/commit/660a94b3b0dca510925ba765713d2b659e4221a5))

## [0.8.0](https://github.com/bastianrang-cf/cplace-browser-extension/compare/v0.7.0...v0.8.0) (2026-05-15)


### Features

* auto-discover modules so adding one requires no core file edits ([#28](https://github.com/bastianrang-cf/cplace-browser-extension/issues/28)) ([48e3c50](https://github.com/bastianrang-cf/cplace-browser-extension/commit/48e3c50766f102fba3516e33319f864852437df6))
* externalize module CSS and generalize asset injection via flags ([#31](https://github.com/bastianrang-cf/cplace-browser-extension/issues/31)) ([9d4a3db](https://github.com/bastianrang-cf/cplace-browser-extension/commit/9d4a3dbf382af26932e113dac730e24c403d4da0))

## [0.7.0](https://github.com/bastianrang-cf/cplace-browser-extension/compare/v0.6.0...v0.7.0) (2026-05-15)


### Features

* add toggleable version badge module (default on) ([#26](https://github.com/bastianrang-cf/cplace-browser-extension/issues/26)) ([3c1865c](https://github.com/bastianrang-cf/cplace-browser-extension/commit/3c1865c5a24897528a2eece5151ee43c8f92da84))

## [0.6.0](https://github.com/bastianrang-cf/cplace-browser-extension/compare/v0.5.0...v0.6.0) (2026-05-14)


### Features

* detect cplace version and show in tooltip and icon badge ([#23](https://github.com/bastianrang-cf/cplace-browser-extension/issues/23)) ([38beef8](https://github.com/bastianrang-cf/cplace-browser-extension/commit/38beef8f37b20b52cb80496e013cd6e31fa72fec))

## [0.5.0](https://github.com/bastianrang-cf/cplace-browser-extension/compare/v0.4.0...v0.5.0) (2026-05-14)


### Features

* add Batch Jobs overlay module ([#11](https://github.com/bastianrang-cf/cplace-browser-extension/issues/11)) ([#18](https://github.com/bastianrang-cf/cplace-browser-extension/issues/18)) ([b5bab44](https://github.com/bastianrang-cf/cplace-browser-extension/commit/b5bab447893ed1312a40dfe554f669f6f8e3cdb7))


### Bug Fixes

* admin access highlight should not be enabled by default ([3e5f76a](https://github.com/bastianrang-cf/cplace-browser-extension/commit/3e5f76a2b8c71262ad593bdfac80ee38e25ee4a9))
* stable extension ID across builds ([#19](https://github.com/bastianrang-cf/cplace-browser-extension/issues/19)) ([170b22f](https://github.com/bastianrang-cf/cplace-browser-extension/commit/170b22f1dac7822d1dcf86250f316c9211c62ffd))

## [0.4.0](https://github.com/bastianrang-cf/cplace-browser-extension/compare/v0.3.0...v0.4.0) (2026-05-14)


### Features

* add Firefox and Safari builds to release pipeline ([de6b58c](https://github.com/bastianrang-cf/cplace-browser-extension/commit/de6b58c201e4f7af594d008bfb3696eb904ccdc5))
* add Firefox and Safari builds to the package script ([25474e2](https://github.com/bastianrang-cf/cplace-browser-extension/commit/25474e2fa25b21dccaeb3cd44fca246396ac1e18))
* disable popup on tabs where cplace is not detected ([2e12088](https://github.com/bastianrang-cf/cplace-browser-extension/commit/2e120887ca67ecea3a7b5d27025e8d3098ee7b52))


### Bug Fixes

* replace inline script with external file to fix CSP violation ([fcbc8c2](https://github.com/bastianrang-cf/cplace-browser-extension/commit/fcbc8c261bdd63b4f232cfbcd2345e342d078911))
* replace inline script with external file to fix CSP violation ([#14](https://github.com/bastianrang-cf/cplace-browser-extension/issues/14)) ([61109bc](https://github.com/bastianrang-cf/cplace-browser-extension/commit/61109bcb08e0eb4a0906a25e93ab67f609aa7549))

## [0.3.0](https://github.com/bastianrang-cf/cplace-browser-extension/compare/v0.2.0...v0.3.0) (2026-05-14)


### Features

* add Language Switcher module with extension popup action menu ([b110f65](https://github.com/bastianrang-cf/cplace-browser-extension/commit/b110f652f3b258320e4c1ade7f39c2cd3a8aad5b))
* Language Switcher module with extension popup action menu ([75cc85a](https://github.com/bastianrang-cf/cplace-browser-extension/commit/75cc85a9d70e42cc7b77c8b976c27f13460cbd8e))


### Bug Fixes

* border instead of outline for admin access highlight ([bd007a9](https://github.com/bastianrang-cf/cplace-browser-extension/commit/bd007a958dc835f29b3baf4dc850290308f57b58))
* cplace brand colors for icon ([e8cbdae](https://github.com/bastianrang-cf/cplace-browser-extension/commit/e8cbdae7e4d0a35578ba36f35ab4e1047b252972))

## [0.2.0](https://github.com/bastianrang-cf/cplace-browser-extension/compare/v0.1.0...v0.2.0) (2026-05-14)


### Features

* cplace detection extension with module system and release-please ([3d960e0](https://github.com/bastianrang-cf/cplace-browser-extension/commit/3d960e0a2e65bf29638d26e2467d416b937cc573))
* migrate to WXT framework and add Vitest test suite with PR CI ([49e3a05](https://github.com/bastianrang-cf/cplace-browser-extension/commit/49e3a05579b4e3bf751d5d2bd2b3cd669c7b0079))
* migrate to WXT framework with Vitest test suite and PR CI ([792d27a](https://github.com/bastianrang-cf/cplace-browser-extension/commit/792d27adddff42b4520e4251025d71477336c25a))
* scaffold cplace detection extension with modules and release-please ([9d169cf](https://github.com/bastianrang-cf/cplace-browser-extension/commit/9d169cf7effca3f611413da8ab021d14740ea4b0))
