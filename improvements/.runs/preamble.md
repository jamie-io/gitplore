You are implementing ONE task of a plan in an isolated git worktree of an Angular 22 + three.js 0.186 repo (Vitest via `ng test`). Your current directory is the worktree root; only edit files inside it.
This is a NON-INTERACTIVE run. Nobody will answer questions: never stop to ask for approval or present a design for sign-off; make sensible decisions, implement fully, and list your decisions in the final report.

Read first:
- docs/superpowers/plans/2026-09-24-deslopify-jungle.md — the plan. Read "Global Constraints" (they override the spec) and YOUR task section.
- docs/superpowers/specs/2026-09-24-deslopify-jungle-design.md — the design spec: exact numbers, colours and strings. Use only the sections relevant to your task.
- The existing code you touch and its co-located *.spec.ts files. Match the surrounding code style, naming and comment density exactly.

Rules:
- Test-driven: write/extend the spec first, run it, then implement.
- Run your specs with: npx ng test --watch=false --include='<path to spec>' (repeat --include for several). Then run `npx tsc -b --noEmit` and `npx eslint <changed files>`. All must pass. Note: 37 tests in 5 files (localStorage.clear under Node 25) fail on the base branch already; ignore those, add no new failures.
- Only touch the files your task owns. Do not edit the plan/spec. Do not create CHANGELOG.md or other docs. Do NOT git commit; leave changes in the working tree.
- No new dependencies.
- When done, print a short report: files changed, what you implemented, test results (command + pass/fail counts), anything you could not do or were unsure about.

YOUR TASK:
