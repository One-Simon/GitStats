# Product

## Register

product

## Users

Developers who want a GitHub profile language stats graphic without manually collecting repository language or activity data. They use this mostly while configuring a GitHub Action, checking the generated SVG, and embedding the result in a profile or project README.

## Product Purpose

GitStats generates SVG language cards from GitHub repository language byte counts for all-time stats and commit file change counts for recent stats. Success means the graphic is readable in README contexts, easy to preview locally, and trustworthy enough to publish without repeatedly running a workflow.

## Brand Personality

Practical, clean, developer-focused. The project should feel like a small reliable tool: direct in its copy, restrained in its interface, and confident in its output.

## Anti-references

Avoid overdecorated dashboard styling, generic SaaS hero patterns, and visuals that obscure the actual generated SVG. The preview experience should not feel like a marketing page or a separate product from the renderer.

## Design Principles

- Preview the real artifact, not a mock.
- Keep configuration visible and close to the output.
- Make iteration fast without requiring GitHub Actions.
- Preserve README compatibility as the primary display context.
- Prefer restrained presentation around the stats card so the SVG remains the focus.

## Accessibility & Inclusion

Use readable contrast, responsive layout, and reduced-motion-safe interactions. The generated SVG should keep semantic title and description metadata for screen readers.
