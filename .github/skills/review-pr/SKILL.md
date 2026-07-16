---
name: review-pr
description: Review a specific vscode-containers pull request on demand from the CLI (or any interactive agent), the way a Container Tools maintainer would. Use when asked to review a PR by number, URL, or "the current branch", to produce a written review and, only when explicitly asked, post comments on the PR. Fetches the PR with the GitHub CLI and applies the shared review rubric.
allowed-tools: shell
---

# Review a Container Tools PR (on demand)

You are reviewing a pull request to `microsoft/vscode-containers` the way a maintainer would.
Apply the shared grading rubric in
[`../code-review/rubric.md`](../code-review/rubric.md) -- read it first; it is the single
source of truth for what to look for and how to grade. This skill only adds how to **get** the
PR and, optionally, how to **post**.

## Modes

Default to **report** unless the user explicitly asks you to comment on / review the PR on
GitHub.

- **report** (default): produce a written review; touch nothing on GitHub.
- **post**: publish review comments on the PR (see Posting). Only when explicitly requested.

Never approve (`gh pr review --approve`) in either mode -- approval is a human decision.

## Get the PR

Accept a PR number (`123`), a URL
(`https://github.com/microsoft/vscode-containers/pull/123`), or "the current branch".
Resolve with the GitHub CLI:

```bash
gh pr view <n> --json number,title,body,author,files,url,state,isDraft,headRefOid
gh pr diff <n>
```

For prior review threads and discussion (so you do not repeat points already made, and can see
what the author pushed back on):

```bash
gh api repos/microsoft/vscode-containers/pulls/<n>/comments   # inline review comments
gh pr view <n> --comments                                     # issue-level discussion
```

If the PR references an issue, read it (`gh issue view <n>`) to confirm the PR addresses it.

If the PR is already **merged or closed**, do a retrospective review in report mode only -- do
not try to post change requests on it.

(Equivalent GitHub MCP Server tools -- `get_pull_request`, `get_pull_request_diff`,
`get_pull_request_files`, `get_pull_request_comments` -- work too if `gh` is unavailable.)

## Produce the review

Apply the rubric to the diff and emit its **Verdict shape** (verdict, blocking issues,
non-blocking suggestions, what looks good, open questions). Ground every point in the diff or a
concrete repo convention and cite the helper/pattern to use.

## Posting (post mode only)

Keep each comment specific and actionable; reference the exact file/line.

- Inline comment on a line:
  `gh api repos/microsoft/vscode-containers/pulls/<n>/comments -f body='...' -f commit_id='<headRefOid>' -f path='<file>' -F line=<n> -f side=RIGHT`
- Summary review (comment, or request changes when the author must act -- never approve):
  `gh pr review <n> --comment --body '...'`  /  `gh pr review <n> --request-changes --body '...'`
- Prefix each agent-posted review comment with a clear reviewer marker (e.g. a magnifying
  glass or detective emoji) so it is distinguishable from a human review.

(Equivalent GitHub MCP Server tools: `create_pending_pull_request_review` ->
`add_comment_to_pending_review` -> `submit_pending_pull_request_review`, or
`create_and_submit_pull_request_review` for a summary-only review.)

## Rules

- Never approve. Read-only otherwise: do not modify code, commit, or push as part of a review.
- In report mode, post nothing to GitHub.
- Prefer asking over asserting when intent is genuinely unclear.
