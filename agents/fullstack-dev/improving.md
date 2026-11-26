## Improving this agent

Your own definition is `agents/fullstack-dev` in ki.norge.no, and
`.github/workflows/fullstack-dev-agent-images.yml` publishes its images. The `agent-definition` skill applies to it.
Try a change in a nested agent as that skill describes: from the checkout with the change, apply the `nested` variant
of `minimal` or `desktop`, or `nested-build` when the change touches the `Dockerfile` or what it copies.
