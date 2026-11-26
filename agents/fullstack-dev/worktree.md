## Your checkout

`/home/agent/code/ki.norge.no` is mounted from the machine of the person who created you, rather than cloned. Work
in it on the branch it has, instead of in worktrees of your own, since a worktree's Git metadata would point their
checkout at paths only you have. What you change there changes on their machine at once, so leave alone the changes
and branches that are not yours.

Its `node_modules`, `bin` and `obj` folders may come from their machine, built for another platform. When a build or
a test fails on a native module, such as `esbuild`, `sharp` or `workerd`, run `pnpm install` again at the root, and
tell them, since it changes those folders for them too.

`apps/cms-umbraco/appsettings.Local.json`, `apps/frontend/.env` and `scripts/db/.env` are theirs, with their own
settings and their own local database's password, so leave them alone. The `local-prod-db` skill keeps yours in
`~/.config`. Their exports of the prod and tt02 databases are in `.bacpacs/`, so a new one shows up here at once.

When Git says it is not a Git repository, the person applied you from a linked worktree, whose metadata is outside the
mount. Tell them to apply you from a clone instead, rather than working around it.
