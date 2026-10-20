# Rapiflix overhaul plan

## Product direction

Rapiflix becomes a cinematic, ad-free discovery product: dark editorial space, luminous lime/coral accents, poster-led storytelling, and motion that guides attention without making the interface noisy.

## Implementation

- `index.html`: minimal accessible shell with loader, navigation, application mount and footer.
- `routes.js`: loader lifecycle, custom cursor and keyboard affordances.
- `app.js`: route parsing, local fallback catalogue, TMDB enrichment, title rooms, watch rooms, search, saved titles, source selection and player setup.
- `styles.css`: responsive visual system, animated image backdrop, poster interactions, title-page composition and mobile watch layout.
- `functions/api/*`: retain secret-backed proxy contracts; playback remains authorized-source-only.
- `_redirects`: SPA rewrites for catalogue, title and watch routes.

## Design

A cinematic editorial system influenced by film festival identities and premium streaming title cards. Principles: one clear focus per viewport, poster art as spatial anchors, motion as hierarchy, and high-contrast safe areas for mobile. The ownable signature color is acid lime, balanced by coral for playback and warning states. Voice is curious, assured and concise: “Stay for the story.” / “Every title gets its own room.”

## Acceptance outcomes

- Full frontend shell replaced.
- Animated background imagery and gradients added.
- Custom cursor and motion behavior added with reduced-motion fallback.
- Detailed loader added.
- Separate title pages at `/title/:id`.
- Separate watch pages at `/watch/:id`.
- Budget, box office, cast, synopsis, rating and runtime displayed where reported.
- Desktop and mobile watch layouts supported.
- No Rapiflix-inserted ads.
- Unsafe default playback provider removed from `streams.json`.
- Existing TMDB/CinePro backend contracts preserved and documented.
