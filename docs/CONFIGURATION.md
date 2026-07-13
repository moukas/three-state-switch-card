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
| `entity` | string | optional | Legacy `input_select.*` or `select.*` three-state entity |
| `state_entity` | string | optional | Actual `on`/`off` state entity for the boolean model |
| `auto_entity` | string | optional | Boolean entity storing auto/manual mode |
| `manual_entity` | string | optional | Writable boolean entity for manual on/off requests |
| `name` | string | entity name | Card title |
| `subtitle` | string | active label | Text shown below the title |
| `variant` | string | `default` | `default` or `minimal` |
| `orientation` | string | `vertical` | `vertical` or `horizontal` |
| `dialog_orientation` | string | `vertical` | Expanded modal orientation for `variant: minimal` |
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
| `show_history` | boolean | `false` | Shows a Home Assistant recorder-style state timeline |
| `history_hours` | number | `24` | Hours shown in the history timeline, from `1` to `168` |
| `history_limit` | number | `5` | Number of recent state changes listed below the timeline |
| `actual_state_entity` | string | empty | Deprecated alias for `state_entity` |
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

For the boolean model (`state_entity` + `auto_entity`), the three internal
`value` entries are fixed as `On`, `Auto`, and `Off` because they drive the
control logic. You can still customize the visible `label`, `icon`, and `color`
for each state in the card editor or YAML.

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

## Minimal Switch Row

```yaml
type: custom:three-state-switch-card
entity: input_select.heating_mode
variant: minimal
orientation: vertical
dialog_orientation: vertical
```

The minimal variant renders as a compact row with the current icon, entity name, and
a small inline three-state switch. The icon is taken from the entity icon when
available. Clicking the icon or name opens a modal with the card's animated
switch. The expanded modal uses `dialog_orientation`, which defaults to
`vertical`; set it to `horizontal` if you want the enlarged minimal switch to open
sideways. The expanded modal includes the same history icon as the default card.

## History Timeline

```yaml
type: custom:three-state-switch-card
state_entity: binary_sensor.heating_active
auto_entity: input_boolean.heating_auto
manual_entity: input_boolean.heating_manual
show_history: true
history_hours: 24
history_limit: 5
```

The history timeline uses the Home Assistant recorder history API, similar to the
standard entity history view. If history is not available yet, the card falls back
to state changes observed while the dashboard is open.
With `state_entity` and `auto_entity`, the history dialog shows two timelines:
actual on/off state and auto/manual mode. This lets you distinguish automatic
operation from manual on/off overrides.
Inline history is intentionally not rendered in `variant: minimal`; use the icon
or name click target to open the larger vertical switch instead.
Default cards also include a chart icon in the header. Clicking it opens a
history/activity dialog for the entity without showing the switch control.
