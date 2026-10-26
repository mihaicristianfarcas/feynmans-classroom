# Running it in Docker

The development container has Node, Jujutsu, Chromium and the model CLIs, so you need only Docker
(Docker Desktop on macOS and Windows, Docker Engine on Linux).

```bash
docker compose up        # http://localhost:5173
```

The first start builds the image and installs the packages; later starts take seconds, and pick up
changes to the Dockerfile or `package-lock.json` by themselves. The repository is mounted, so edits
reload as they do natively, and your books and notes stay in `./data`.

## Commands

Run anything from [CONTRIBUTING.md](../CONTRIBUTING.md) in a throwaway container, whether the app is
up or not:

```bash
docker compose run --rm app npm run verify
docker compose run --rm app npm run test:a11y -- --serve
```

The git hooks do the same when the packages aren't installed on your machine, so commit and push
from your own terminal as usual.

## Logging in to a model CLI

Only the model features need it. Logins on your machine don't reach the container, so log in once
inside; the login is kept in a volume until `docker compose down -v`.

```bash
docker compose run --rm app codex login --device-auth
docker compose run --rm app claude        # follow the link, then /exit
docker compose run --rm app opencode auth login
```

## Settings

Put these in `.env` (ignored by git) or in front of the command:

| Variable | Default | |
|---|---|---|
| `CLASSROOM_DATA` | `./data` | the data folder |
| `CLASSROOM_WEB_PORT` | `5173` | the app's port on your machine |
| `CLASSROOM_API_PORT` | `8787` | the API's port on your machine |

A second copy (another worktree, or a test copy) gets its own container and volumes by itself,
because Compose names them after the folder.

## Platforms

- **macOS, Linux:** works as is, but for agents' commands on Debian and Ubuntu hosts and in colima
  (see [the agents' sandbox](#the-agents-sandbox)). Files the container writes belong to you.
- **Windows:** clone inside WSL 2 and run Docker from there. A clone on the Windows drive is slow
  and edits won't reload.

## The agents' sandbox

Agents run in an OS sandbox (bubblewrap on Linux: their CLI's own, or for OpenCode the image's
`bwrap`), which needs user namespaces and a `/proc` it can mount. `docker/seccomp.json` is Docker's
default seccomp profile plus the six syscalls for the first; `systempaths=unconfined` gives the
second. Don't swap them for `privileged`, and don't use Claude Code's `enableWeakerNestedSandbox`,
which would show agents the files the sandbox hides.

Without them the CLIs refuse to run agents' commands. `npm test` checks the sandbox with real
commands (`tests/agent-sandbox.test.ts`), so a host where it doesn't hold fails the tests. On Linux
hosts with AppArmor (Debian, Ubuntu), Docker's AppArmor profile stops bubblewrap's mounts too
("Failed to make / slave"): agents' commands work there only with `apparmor=unconfined` under
`security_opt` in a `compose.override.yaml` (ignored by git). Ubuntu 23.10 and later (and colima,
whose VM is Ubuntu) also keep programs from using user namespaces without an AppArmor profile that
allows it ("setting up uid map"), which only the host can change. Either way the rest of the app
works as usual.
