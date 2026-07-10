# Configuration

## Minimal Configuration

```yaml
type: custom:three-state-switch-card
entity: input_select.heating_mode
```

The entity must expose exactly three options. Without explicit configuration, the card
uses the first three values from the entity `options` attribute.

## All Options

| Option | Type | Default | Meaning |
|---|---|---:|---|
| `entity` | string | required | `input_select.*` or `select.*` |
| `name` | string | entity name | Card title |
| `subtitle` | string | active label | Text shown below the title |
| `orientation` | string | `vertical` | `vertical` or `horizontal` |
| `reverse` | boolean | `false` | Reverses the state order |
| `show_name` | boolean | `true` | Shows the title |
| `show_subtitle` | boolean | `true` | Shows the subtitle |
| `show_labels` | boolean | `true` | Shows text labels |
| `compact` | boolean | `false` | Uses tighter spacing and dimensions |
| `interaction` | string | `tap-drag` | `tap` or `tap-drag` |
| `haptic` | boolean | `true` | Triggers companion-app haptics |
| `confirm` | boolean | `false` | Shows a confirmation dialog before changing state |
| `disabled` | boolean | `false` | Read-only mode |
| `optimistic` | boolean | `true` | Updates the UI immediately before state confirmation |
| `options` | array | automatic | Exactly three items |

## `options` Item Format

```yaml
options:
  - value: "on"
    label: "On"
    icon: mdi:power
    color: var(--success-color)
```

- `value` must match the entity state exactly and is required.
- `label` is the text shown to the user.
- `icon` is a Material Design Icons identifier.
- `color` can be any valid CSS color or CSS variable.

## Example for `input_select`

```yaml
input_select:
  heating_mode:
    name: Heating mode
    options:
      - "On"
      - "Auto"
      - "Off"
    initial: "Auto"
```

```yaml
type: custom:three-state-switch-card
entity: input_select.heating_mode
name: Heating
```

## Example for `select`

```yaml
type: custom:three-state-switch-card
entity: select.heat_pump_mode
name: Heat pump
subtitle: Manual control
orientation: horizontal
options:
  - value: force_on
    label: "On"
    icon: mdi:power
    color: "#43a047"
  - value: automatic
    label: "Auto"
    icon: mdi:autorenew
    color: var(--primary-color)
  - value: force_off
    label: "Off"
    icon: mdi:power-off
    color: "#757575"
```

## Indicator-Only Mode

```yaml
type: custom:three-state-switch-card
entity: input_select.heating_mode
disabled: true
show_labels: false
compact: true
```
