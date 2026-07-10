# Three State Switch Card

A polished three-position Home Assistant Lovelace card for `input_select` and `select`
entities that expose exactly three options, typically **On / Auto / Off**.

![Design reference](docs/design-reference.png)

## Features

- Vertical and horizontal layouts
- Direct tap selection and drag interaction
- Automatic option loading from the entity
- Custom values, labels, icons, and colors
- Visual card editor for Lovelace
- Section dashboard and resize support
- Keyboard navigation and ARIA attributes
- Haptic feedback in the Home Assistant companion app
- Optimistic UI updates with error handling
- No runtime dependencies

## Quick Start

```yaml
type: custom:three-state-switch-card
entity: input_select.heating_mode
name: Heating
orientation: vertical
options:
  - value: "On"
    label: "On"
    icon: mdi:power
    color: var(--success-color)
  - value: "Auto"
    label: "Auto"
    icon: mdi:autorenew
    color: var(--primary-color)
  - value: "Off"
    label: "Off"
    icon: mdi:power-off
    color: var(--disabled-text-color)
```

Design notes are in [docs/DESIGN.md](docs/DESIGN.md).
Installation is in [docs/INSTALLATION.md](docs/INSTALLATION.md).
Configuration options are in [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

## Project Status

Version `0.1.0` is a publishable baseline for a GitHub repository and HACS custom
repository workflow. Before publishing, set the final `documentationURL` in the card
metadata, add real screenshots, and create a GitHub Release.
