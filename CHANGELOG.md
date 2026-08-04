# Changelog

All notable changes to this project are documented in this file.


## [Unreleased]

### Added

- Basic update instructions and consistently formatted configuration examples.
- ESLint checks, a reproducible development lockfile, and weekly Dependabot updates.
- Project code of conduct and release changelog.

## [1.3.0] - 2026-08-01

### Added

- Idempotent playback, URI, volume, and player-selection notifications for automation.
- Deduplicated playback-state and connection-state notifications for other modules.
- Bulgarian, Danish, German, English, Spanish, French, Hungarian, Dutch, Russian, and Thai translations.
- Fullscreen and compact-layout screenshots.

### Changed

- Sample configurations show the player selector by default.
- Fixed-player configuration continues to hide the selector when `playerId` is set.

## [1.2.0] - 2026-08-01

### Added

- Compact layout for standard MagicMirror regions.

## [1.1.2] - 2026-07-26

### Changed

- Playback controls use a consistent neutral appearance.

## [1.1.1] - 2026-07-25

### Fixed

- Player selector markup is omitted when a fixed player is configured.

## [1.1.0] - 2026-07-24

### Added

- Optional fixed-player configuration and compact-layout support.

## [1.0.2] - 2026-07-24

### Fixed

- Layout is constrained to the viewport space available at its rendered position.

## [1.0.1] - 2026-07-24

### Fixed

- MagicMirror dependency scripts resolve through the module directory.

## [1.0.0] - 2026-07-24

### Added

- Initial Music Assistant WebSocket connection, player selection, now-playing display, controls,
  playlist launchers, reconnection, generic notifications, tests, and documentation.

[Unreleased]: https://github.com/bwente/MMM-MusicAssistant-Controller/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/bwente/MMM-MusicAssistant-Controller/releases/tag/v1.3.0
[1.2.0]: https://github.com/bwente/MMM-MusicAssistant-Controller/compare/f8703585aebb6a3655bcc8933cff634ea76b228c...85b31cb4a7c7f3708c5362db36026c485097a79c
[1.1.2]: https://github.com/bwente/MMM-MusicAssistant-Controller/compare/686065956cd813b7f3f9abebaad272df62061bfa...f8703585aebb6a3655bcc8933cff634ea76b228c
[1.1.1]: https://github.com/bwente/MMM-MusicAssistant-Controller/compare/ad4ef8d37cfb47fc067477c13a7e2c413bcadbd0...686065956cd813b7f3f9abebaad272df62061bfa
[1.1.0]: https://github.com/bwente/MMM-MusicAssistant-Controller/compare/77e748e539035ae41accf38f00c1dd70a5921174...ad4ef8d37cfb47fc067477c13a7e2c413bcadbd0
[1.0.2]: https://github.com/bwente/MMM-MusicAssistant-Controller/compare/41840c96f711a6b14916d59120f436b8f9d1b0f7...77e748e539035ae41accf38f00c1dd70a5921174
[1.0.1]: https://github.com/bwente/MMM-MusicAssistant-Controller/compare/445a5f42a4e2f7464569da1eaa52d322b1a249fa...41840c96f711a6b14916d59120f436b8f9d1b0f7
[1.0.0]: https://github.com/bwente/MMM-MusicAssistant-Controller/commit/445a5f42a4e2f7464569da1eaa52d322b1a249fa
