# Kinly design system

Kinly uses a warm, low-contrast visual system for care tracking on mobile screens. The UI favors readable status information and large touch targets over dense dashboards.

## Design tokens

Use CSS custom properties for color, spacing, radius, typography, and elevation. Feature styles consume the tokens instead of defining another token set.

Core visual values:

```css
--color-primary-dark: #33251f;
--color-primary-dark-hover: #241914;
--color-primary-brown: #4a372e;
--color-sage: #8da06f;
--color-sage-dark: #748756;
--color-sage-light: #e5ecd9;
--color-sage-subtle: #f1f5eb;

--color-canvas: #faf8f5;
--color-card-bg: #ffffff;
--color-card-warm: #f6f3ed;
--color-text-primary: #2d231e;
--color-text-secondary: #82776e;
--color-text-muted: #b2a89f;
--color-border-subtle: #ece6dd;

--radius-xs: 8px;
--radius-sm: 12px;
--radius-md: 18px;
--radius-lg: 24px;
--radius-xl: 32px;
--radius-pill: 9999px;
```

## Typography

Use rounded sans-serif typography with a clear mobile hierarchy.

- Display values: 36px to 44px, bold
- Page headings: 22px to 26px, bold
- Card headings: 16px to 18px, semibold or bold
- Body: 12px to 15px with comfortable line height
- Captions: 10px to 11px, semibold

Do not reduce health or care information below a readable mobile size to fit more metrics on one screen.

## Components

### Buttons

Primary actions use a dark brown or sage background, high-contrast text, a pill radius, and at least a 44px touch target.

Secondary actions use a neutral surface with a subtle border. Destructive actions use the existing warning and destructive tokens rather than a feature-specific red.

### Cards

Cards use the white or warm card surface, soft borders, and restrained elevation. Use a card when it groups related information or actions. Do not wrap every row in a card.

### Dialogs and bottom sheets

Dialogs and sheets share the same focus, dismissal, backdrop, body-scroll lock, and motion behavior. Feature code provides content and domain actions.

`BottomSheet` is the shared adaptive shell. Above 520px it is a centered dialog with four rounded corners, desktop elevation, and no visible drag indicator. At or below 520px it is bottom-attached and full width with a large top radius, a visible indicator, and drag-down dismissal from the header.

Sheet content is the only scrolling region; fixed actions stay outside it in the footer and use the shared primary, secondary, or destructive action styles. Sheets retain enough footer padding for device safe areas. Compact confirmations remain centered dialogs without the sheet indicator or drag dismissal, as do dedicated date pickers, popups, media viewers, and page overlays.

### Fields

Fields share label, input, error, help text, disabled state, and focus styles. Domain-specific controls such as milk amount or medication selection may compose the field building blocks.

### Empty states

An empty state says what is missing and gives one useful next action. Avoid demo numbers that look like real user data.

## Native animation

Use browser-native animation primitives. Prefer CSS transitions/keyframes for simple enter, exit, opacity, transform, hover, and press feedback. Use the View Transition API for route-level transitions, Pointer Events for direct manipulation, and the Web Animations API for gesture settle/dismiss sequences.

Keep per-frame gesture values out of React state and avoid animating layout-heavy properties, filters, or permanent compositing hints. Every animation must respect `prefers-reduced-motion`.

## Layout

Design for a narrow mobile viewport first.

- Keep primary actions reachable with one hand.
- Reserve bottom safe-area space around fixed navigation.
- Prefer one clear reading column.
- Use two-column metric layouts only when both values remain readable.
- Keep timeline chronology visually obvious.

## Status color

Color supports a label or value. Color alone must not communicate health state, completion, warning, or error.

Use the existing sage, honey, clay, rose, lavender, and neutral tones consistently across features. Do not create another feature-only palette when an existing token has the same meaning.

## Shared and feature styles

The target style layout is:

```text
shared/styles/
├── tokens.css
├── base.css
└── primitives.css

features/
├── home/home.css
├── timeline/timeline.css
├── growth/growth.css
└── ...
```

A selector belongs in `shared/styles` only when more than one feature uses the same component contract. Keep feature layout selectors with their feature.

When moving styles, remove the old selector after all consumers move. Do not keep legacy and replacement layers active at the same time.
