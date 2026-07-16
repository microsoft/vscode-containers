---
name: code-review
description: Review a pull request in this repository (the vscode-containers / Container Tools extension) against the maintainers' house style. Use this whenever reviewing a pull request or its changed files to check localization, async/resource correctness, TypeScript conventions, command-line construction, telemetry, settings, and cross-platform issues distilled from this repo's review history.
---

# Container Tools code review

Apply the shared grading rubric in [`rubric.md`](./rubric.md) to the pull request under
review. That file is the single source of truth for what to look for and how to grade it --
read it and follow it.

You already have the pull request's diff and changed files provided to you, and your review
comments are published through the normal review mechanism. So:

- **Do not** fetch the PR yourself or run `gh` -- work from the diff you were given.
- **Do not** approve. Leave comments / request changes only; approval is a human decision.
- Focus your comments on the changed lines. Ground every point in the diff or a concrete repo
  convention, and cite the exact helper or pattern the author should use instead of a generic
  complaint.
- Prefer high signal, low noise: raise real, high-confidence issues; route genuine "did you
  intend X" points as questions rather than assertions; drop speculation.

Follow the rubric's severity/confidence grading and the "What NOT to flag" list so the review
stays useful and does not bury maintainers in nits.
