# Product

## Register

product

## Users

The developer (personal use). Runs FeedDeck on an iPad mini placed next to a desktop monitor as an always-on secondary display. Glances at it periodically for information updates, rarely interacts directly. Also accessed from desktop and phone browsers for configuration.

## Product Purpose

A personal information dashboard that aggregates RSS feeds, hot search trends, weather, todos, calendar events, and social media stats into a single glanceable view. Exists to reduce context-switching: instead of opening 6+ apps/sites, one screen shows everything worth knowing at a glance. Success means the user never has to alt-tab for information.

## Brand Personality

安静、专注、实用 (quiet, focused, practical). The interface should feel like a well-organized desk: everything has its place, nothing demands attention unless it matters. No visual noise, no decorative flourish, no marketing polish.

## Anti-references

- **Information overload news wall** (Flipboard, Toutiao): Dense, chaotic, competing for attention. FeedDeck should be calm and scannable.
- **SaaS dashboard template** (Datadog, Linear dashboards): Gradient cards, metric big-numbers, analytics feel. FeedDeck is personal, not enterprise.
- **iOS system UI clone** (Stocks, Settings app): Don't mimic platform aesthetics. FeedDeck has its own visual language.

## Design Principles

1. **Glanceable over interactive** — Designed for 2-second reads from arm's length, not deep interaction. Typography and spacing serve distance readability first.
2. **Information density without clutter** — Pack useful data into the viewport, but give each piece enough breathing room to be individually scannable.
3. **Auto-pilot by default** — Data refreshes automatically. The user should never need to pull-to-refresh or manually trigger updates during normal use.
4. **Dark-first, light-aware** — Always-on display in dim environments favors dark theme. Light theme follows system preference for desktop/config use.
5. **Multi-device by necessity** — Responsive not as a feature, but because the same codebase serves iPad (primary), desktop (config), and phone (occasional). Every breakpoint is a real use case.

## Accessibility & Inclusion

- High contrast support: text must be readable at 35-100cm viewing distance on iPad
- WCAG AA contrast ratios (≥4.5:1 body text, ≥3:1 large text)
- Keyboard navigable for config pages
- `prefers-reduced-motion` support for GSAP animations
- Dark/light theme follows system preference automatically
