---
name: pr-evidence
description: Show reviewers of a ki.norge.no pull request what a change does, with the checks that ran and screenshots of the pages or the Umbraco backoffice it changes. Use before opening or updating a pull request.
---

# Show the change to reviewers

A reviewer knows only the pull request and its issue, and should see what changed without running it.

## What to show

- **The checks you ran**, for each part the change touches, as the agent's instructions list them, and their outcome.
  Put a failing or skipped check, and why, in the body too.
- **A screenshot of each page or component the change alters**, before and after when the difference matters. It
  takes the `desktop` agent. On `minimal`, say which screenshots are missing and that the `desktop` agent can take them.
  - A page: start the frontend in `apps/frontend` with
    `pnpm exec astro dev --background --host 127.0.0.1 --port 4331`, which reads content from a CMS on
    `localhost:5000` unless `UMBRACO_URL` names another. Run it against a local Umbraco, from the `local-umbraco` or
    the `local-prod-db` skill, as they describe. The host and port let the person see it too, through `forward.sh`.
  - Umbraco: the backoffice of a local Umbraco, as the `local-umbraco` skill describes.
  - On a copy of prod, show only what the public site shows. Leave editor accounts, unpublished content and other
    personal data out of every image.
- **A recording** only when the change is a flow that a screenshot cannot show, such as a menu or a form. Make it as
  the `recording` skill describes.

Take a still with `playwright-cli screenshot --filename=page.png` at a desktop width, and again at a phone width when
the layout changes with it.

- Keep artifacts under `/home/agent/code/.artifacts/<task>/`, outside the checkout, and never commit them.
- Show test content only, and no secrets, tokens or personal data.
- Keep each file within 10 MiB.
- Give each image a caption in the body: which page, at which width, before or after.

## Attach

Write the body with local references to the files, and run `gh` from the artifact directory with one `--attach` per
file. It uploads them and rewrites the references to hosted URLs. After pushing the branch:

```sh
gh pr create --repo digdir/ki.norge.no --base main --head <branch> \
  --title '...' --body-file pr-body.md --attach ./after.png
gh pr edit <number> --attach ./after.png
```

A failed upload can still have created or updated the pull request, so look at it before retrying, and retry missing
files with `gh pr edit`. Read the body back with `gh pr view <number> --json body -q .body` and check that every
attachment has a hosted URL.
