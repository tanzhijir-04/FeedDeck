---
target: dashboard
total_score: 20
p0_count: 0
p1_count: 2
p2_count: 2
p3_count: 1
timestamp: 2026-06-09T05-05-23Z
slug: src-dashboard-html
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 1 | No data freshness indicator, no loading state on initial load, no network error feedback |
| 2 | Match System / Real World | 3 | Chinese labels are clear; card metaphor is intuitive; hot search ranks map to real concepts |
| 3 | User Control and Freedom | 2 | No manual refresh, no undo for todo toggle, collapsed cards reappear silently after 5s with no user control |
| 4 | Consistency and Standards | 3 | Consistent card styling; social section diverges (single vs. multi-account layouts are visually disconnected) |
| 5 | Error Prevention | 2 | Delete confirms exist, but no handling for network failure, stale data, or concurrent edits |
| 6 | Recognition Rather Than Recall | 3 | Labeled tabs, visible card titles, clear section headers; news items lack source attribution |
| 7 | Flexibility and Efficiency | 1 | Read-only dashboard with zero power-user features; no keyboard nav, no shortcuts, no customization |
| 8 | Aesthetic and Minimalist Design | 3 | Clean, dense, purposeful; minor noise from inconsistent empty state copy |
| 9 | Error Recovery | 1 | Failed data loads show nothing; no retry mechanism; no indication data is stale vs. absent |
| 10 | Help and Documentation | 1 | No help anywhere; no tooltips, no contextual hints, no "what does this mean?" for AQI/weather codes |
| **Total** | | **20/40** | **Acceptable — significant improvements needed** |

## Anti-Patterns Verdict

**LLM assessment:** The dashboard does NOT trigger the immediate "AI made this" response. The dark instrument-panel aesthetic is coherent and purposeful. The CSS variable token system shows genuine engineering discipline. The 6-card grid layout with GSAP Flip animations is a real design choice, not a template default. However, two subtle tells exist: (1) the empty state messages are generic ("暂无数据", "暂无资讯", "暂无待办") with no guidance or illustration, which is the AI default for empty states; (2) the social section's single/multi-account layout split feels like two separate solutions stitched together rather than one coherent component.

**Deterministic scan:** Detector unavailable (bundled detect-antipatterns.mjs not found in skill installation). Manual review findings folded into assessment.

## Overall Impression

FeedDeck's dashboard is a well-crafted information surface with a clear identity. The dark charcoal palette with Ember Orange accent is restrained and functional. The serif/sans typography split for data vs. body text is a smart choice that makes numbers instantly scannable. The CSS variable token system with 4 responsive breakpoints is production-quality engineering.

The single biggest opportunity: state communication. The dashboard tells you what IS but never what WAS or what HAPPENED. No "updated 2 minutes ago", no "failed to load", no "showing cached data". For an always-on display, this is the difference between a useful instrument and a pretty picture.

## What's Working

1. **The Charcoal Layer Rule is executed well.** The bg → surface → surface-alt → surface-low hierarchy is visually consistent and creates genuine depth without shadows.

2. **Typography serves the use case.** The serif display face for data numbers creates instant visual recognition. The sans body for labels keeps the functional layer clean.

3. **Skeleton loading is the right choice.** Structured placeholders during data fetch are better than spinners for a dashboard.

## Priority Issues

**[P1] No data freshness indicator**
- What: The dashboard shows data with no timestamp, no "last updated" marker, no visual cue that data is fresh or stale.
- Why it matters: The core value proposition is "glance and know." Without freshness signals, the user must trust that background polling works.
- Fix: Add a subtle "更新于 HH:MM" timestamp in each card header or a global status bar.
- Suggested command: `/impeccable craft data-freshness-indicator`

**[P1] Silent failure on network errors**
- What: When api.getDashboard() throws, the catch block is empty. No toast, no error state, no retry.
- Why it matters: On a secondary display, network interruptions are common. Silent failure means the user unknowingly trusts stale data.
- Fix: Show a subtle error indicator on fetch failure. Auto-retry after 30 seconds.
- Suggested command: `/impeccable harden dashboard`

**[P2] No keyboard focus indicators**
- What: No :focus-visible styles exist anywhere in the dashboard.
- Why it matters: Violates WCAG 2.4.7 (Focus Visible). Keyboard-only users cannot see where they are.
- Fix: Add :focus-visible outline to interactive elements.
- Suggested command: `/impeccable audit dashboard`

**[P2] Empty states teach nothing**
- What: Every empty state shows a single line of text with no guidance or CTA.
- Why it matters: First-time users see blank cards with no direction. The empty state is the onboarding moment.
- Fix: Each empty state should include explanation + link to config section.
- Suggested command: `/impeccable onboard dashboard`

**[P3] News items lack source attribution**
- What: News items show title and time but not which RSS feed they came from.
- Why it matters: With multiple RSS sources, the user can't tell which source an article came from.
- Fix: Include feed source name in renderNews().
- Suggested command: `/impeccable clarify dashboard`

## Persona Red Flags

**Alex (Power User):** No keyboard shortcuts. No manual refresh. No bulk todo actions.

**Sam (Accessibility-Dependent):** No focus indicators. No ARIA roles on tabs. No reduced-motion fallback for GSAP animations.

**Riley (Stress Tester):** No handling for empty platform results. No animation cancellation path. Timer-based card hiding has no data-arrival interruption.

## Minor Observations

- hot-rank font uses var(--font-display-en) which may not be defined in current base.css
- Social stat icon container larger than SVG content creating dead space
- Grid layout entirely JS-driven, CSS Grid native responsive unused
- wx-sun-divider barely visible on small screens

## Questions to Consider

1. What if the dashboard had an opinion about data quality?
2. Does the config page need to exist as a separate surface?
3. What would a confident empty state look like?
