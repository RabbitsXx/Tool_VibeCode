---
description: UI polish pass - hierarchy, spacing, responsive, states, accessibility, real copy
argument-hint: <page or component>
---

Polish the UI for: $ARGUMENTS

1. Read the relevant components/styles and the project's existing design tokens (colors, fonts, spacing). Reuse them; if none exist, define them once as CSS variables or theme config and use them everywhere.
2. If a dev server or browser tool is available, run it and look at the result at phone (~375px), tablet (~768px) and desktop (~1280px) widths. Do not judge a UI only from code.
3. Check and fix, in this order:
   - **Hierarchy**: one clear primary action per view; headings, size and weight guide the eye.
   - **Spacing and alignment**: consistent scale, nothing cramped or floating.
   - **States**: hover, focus-visible, active, disabled, loading, empty, error, success.
   - **Responsive**: no horizontal scroll on mobile, touch targets at least 44px, readable line length.
   - **Accessibility**: contrast at least WCAG AA, keyboard order and visible focus, labels on inputs, alt text, semantic elements, reduced-motion respected.
   - **Copy**: replace placeholder text with real, concise wording in the product's tone.
4. Keep the change focused on presentation; do not alter behavior or data flow unless a bug blocks the polish.
5. Report what you changed, what you verified at which widths, and any remaining gaps. For an independent critique, use the `vibe-ui-reviewer` subagent.
