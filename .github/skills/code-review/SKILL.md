---
name: code-review
description: Review a pull request in this repository (the vscode-containers / Container Tools extension) when the automated reviewer has already supplied the diff and changed files. Checks localization, async/resource correctness, TypeScript conventions, command-line construction, telemetry, settings, and cross-platform issues distilled from this repo's review history. For an on-demand review by PR number, URL, or current branch, use review-pr instead.
---

# Container Tools code review

Apply the shared grading rubric in [`rubric.md`](./rubric.md) to the pull request under
review. That file is the single source of truth for what to look for and how to grade it --
read it and follow it.

This skill is for the automated review context, where the pull request's diff and changed files
are already provided and review comments are published through the normal review mechanism. If
that context is not present, use `review-pr` instead. So:

- **Do not** fetch the PR yourself or run `gh` -- work from the diff you were given.
- **Do not** approve. Leave comments / request changes only; approval is a human decision.
- Focus your comments on the changed lines. Ground every point in the diff or a concrete repo
  convention, and cite the exact helper or pattern the author should use instead of a generic
  complaint.
- Prefer high signal, low noise: raise real, high-confidence issues; route genuine "did you
  intend X" points as questions rather than assertions; drop speculation.

Follow the rubric's severity/confidence grading and the "What NOT to flag" list so the review
stays useful and does not bury maintainers in nits.
