# AGENTS.md

## Project identity

CompositionNotebook is a customer-facing PromptParty and Codefair project: a full-frame interactive composition notebook cover where visitors can write on the label and download the result. Treat this repository as production application code for a real user-facing product, not a disposable mockup.

## Core stack

Use this stack unless a task explicitly changes it:

- Vite
- React
- TypeScript
- Canvas 2D
- Plain CSS
- Lucide React for icons
- Vercel static deployment

Do not migrate this app to Next.js, add a backend, add auth, add a database, or introduce heavy UI frameworks unless the task explicitly requires it.

## Product mindset

The first screen is the product. The app should fill the Codefair or PromptParty frame with no landing page, nav, marketing copy, decorative cards, or unrelated UI chrome.

Keep the core experience focused:

- the notebook cover fully fills the project frame
- the black-and-white composition pattern remains dense, high contrast, and readable at feed size
- idle motion feels like low-frame jittery TV static
- the label stays centered and visually modeled after a classic composition notebook
- users can draw only on the label area
- handwriting uses smoothing so names are easy to write with mouse, pen, or touch
- black, red, and blue pen colors are available at the top left
- pen size is controlled by the nearby slider
- the top-right refresh button clears the writing and spins when clicked
- the top-right camera button downloads the composed notebook image
- interactive buttons grow on hover, ripple when clicked, and return to their resting size

## Supabase migrations

For every task, explicitly check whether the requested change requires a Supabase schema, RLS, seed, function, trigger, or policy migration.

If a migration is needed:

- create a real Supabase migration in the repository's migrations directory
- apply the migration before finishing the task
- verify app code matches the migrated schema and policies
- include migration status in the final handoff

Do not leave required database changes as TODOs, manual dashboard edits, or unapplied migration files.

## Required commands

Before finishing every task, run:

```bash
npm run lint
npm run check
npm run build
```

## Visual direction

Match the supplied composition notebook reference: stark black-and-white mottled cover texture, slightly imperfect white label shape, bold uppercase `COMPOSITION BOOK` text, ruled name lines, and small manufacturer-style text near the lower left of the label.

Avoid one-note gradients, decorative blobs, oversized hero treatments, cards, visible instructions, and text overlays that compete with the notebook.

## Accessibility and motion

Keep controls keyboard focusable and labeled with accessible names. Respect `prefers-reduced-motion` by reducing nonessential animation. Keep pointer and touch input working across desktop and mobile.

## Pull request handoff

At the end of every task after bootstrap, after all required checks have passed and task-specific verification is complete, create a pull request with the latest changes. Do not consider a future task complete until changes are committed, pushed, and a PR is opened.
