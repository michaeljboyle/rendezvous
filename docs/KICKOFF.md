# Kickoff prompt for Claude Code

Paste the text below into Claude Code, opened in this repository, to start the build.

---

Build the Rendezvous Simulator described in `docs/prompt.md`.

Before writing code:
1. Read `CLAUDE.md`, then all of `docs/prompt.md`.
2. Look at the three mockup PNGs in `docs/mockups/`, and open the matching `.html` files when you need exact colors, sizes or spacing.
3. Reply with a short build plan that follows the order in CLAUDE.md, and list any spec ambiguities you found. Then start.

While building:
- Physics first, with tests. Do not start the views until the propagator, frame conversions and preset end-state tests pass, including the T+01:05:00 cross-check in CLAUDE.md.
- Commit after each stage with a clear message.
- After each view, compare your build to its mockup at the same viewport size and fix visible differences in layout, color, type and line styles.
- If the spec and a mockup disagree, follow the spec and note the difference in your summary.

Done means every acceptance criterion in `docs/prompt.md` is met, `npm test` passes, and the GitHub Pages workflow deploys the build.
