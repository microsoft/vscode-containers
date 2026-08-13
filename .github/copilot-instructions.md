# Copilot / agent instructions for vscode-containers

Guidance for AI coding agents working in this repository.

## Curated files — do not auto-edit

Some files are curated by maintainers and must not be edited as a side effect of a
code change. Do not add, reword, or reorder entries in them unless the task is
explicitly about updating that file.

- **`extensions/vscode-containers/CHANGELOG.md`** — The changelog is hand-curated by
  maintainers as part of the release process. Do **not** add a changelog entry when
  implementing a feature or fix; leave it untouched.
- **`extensions/vscode-docker/CHANGELOG.md`** — Same as above.
- **`NOTICE.html`** — A generated, curated artifact; never hand-edit it.

## Reviewing pull requests

This repository ships its own review skills under `.github/skills/`. When asked to
review a PR (or when performing an automated review), use them and follow the shared
grading rubric rather than reviewing ad hoc:

- **`code-review`** (`.github/skills/code-review/SKILL.md`) — For the automated review
  context where the PR diff and changed files are already provided. Works from the given
  diff; does not fetch the PR or run `gh`.
- **`review-pr`** (`.github/skills/review-pr/SKILL.md`) — For on-demand reviews of a PR by
  number, URL, or "the current branch". Fetches the PR with the GitHub CLI and, only when
  explicitly asked, posts comments.
- **`.github/skills/code-review/rubric.md`** — The shared grading rubric both skills apply.
  It is the single source of truth for what to look for and how to grade a change. Never
  approve a PR — approval is a human maintainer's decision.
