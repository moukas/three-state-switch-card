# Visual and Interaction Design

## Goal

The card should feel like a native Home Assistant control while visually borrowing from
the tall rounded switch shown in the reference image. It is not meant to look like three
separate buttons. The user should perceive one physical control with three fixed positions.

## Visual Design

### Vertical Variant

- The entity name sits at the top, with a short subtitle or the current state below it.
- The switch uses a tall rounded track divided into three equally sized invisible zones.
- The active thumb occupies exactly one third of the track.
- The center of the thumb uses a simple circular marker inspired by the reference image.
- Inactive icons stay subtle, while the active icon is hidden to keep the control clean.
- Labels can appear to the right of the track, with the active label emphasized.
- Corners, shadows, and colors follow the active Home Assistant theme.

The default order is:

1. Top position: On
2. Middle position: Auto
3. Bottom position: Off

`reverse: true` flips the order.

### Horizontal Variant

The same control is rotated by 90 degrees. It fits well in wide dashboard sections or on
mobile layouts with limited vertical space.

## Interaction

### Tap

Tapping any third of the control immediately selects the matching option. The external
text label is also clickable.

### Drag

With `interaction: tap-drag`, the user can press and drag across the control. During the
gesture, the thumb previews one of the three positions. On release, the card calls
`select_option`.

### Keyboard

When the control is focused:

- `ArrowUp` and `ArrowLeft` move to the previous state
- `ArrowDown` and `ArrowRight` move to the next state
- `Home` selects the first state
- `End` selects the last state

### Haptic Feedback

When a selection is made, the card dispatches a `haptic` event with the `selection` type.
The Home Assistant Companion App can translate that into a short vibration.

## Home Assistant Writes

- `input_select.*` -> `input_select.select_option`
- `select.*` -> `select.select_option`

With `optimistic: true`, the card first moves the thumb locally and then waits for the
updated entity state. That keeps the UI responsive. If the entity confirms the new state,
the temporary state is cleared. If the backend call fails, the card reverts and sends a
Home Assistant notification event. If the state never comes back, the optimistic preview
is cleared by a timeout.

## Error and Edge States

- Missing entity: the card is dimmed and disabled.
- `unavailable` or `unknown`: the card is dimmed.
- Anything other than exactly three options: the card shows an explanatory subtitle and disables interaction.
- Unsupported domain: `setConfig` throws and Home Assistant shows an error card.
- Active value missing from the configured options: the middle position is used as a safe fallback preview.
- `disabled: true`: the card only displays state and does not write anything.

## Accessibility

The control uses `role="radiogroup"` and each position uses `role="radio"`.
The active position sets `aria-checked="true"`. The card also respects
`prefers-reduced-motion`.

## Size

### Sections Dashboard

Vertical:

- Default size: `3 x 6`
- Minimum size: `3 x 5`

Horizontal:

- Default size: `6 x 3`
- Minimum size: `3 x 3`

### Masonry Dashboard

`getCardSize()` returns `6` for vertical and `3` for horizontal.

## CSS Variables

The card can be tuned with themes or `card-mod`:

```yaml
--three-state-track: rgba(120, 120, 120, 0.28)
--three-state-thumb: var(--primary-color)
--three-state-radius: 32px
--three-state-duration: 280ms
--three-state-card-padding: 20px
```

## Future Extensions

Possible `0.2.x` improvements:

- Optional last-change timestamp
- Separate hold actions
- Mapping states from other domains through a custom service call
- Editor localization for multiple languages
- Playwright coverage against a live Home Assistant frontend
