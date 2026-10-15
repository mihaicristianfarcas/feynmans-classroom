# Sourced by the hooks: runs a command with this machine's packages if installed, else in the container.
in_env() {
  if [ -x node_modules/.bin/tsc ]; then
    "$@"
  elif ! command -v docker >/dev/null 2>&1; then
    echo "✗ Neither npm install nor Docker here: see CONTRIBUTING.md or docs/docker.md."
    return 1
  elif [ -f .git ]; then
    # a worktree: its git data lives in the main checkout's .git, which the container must see too
    common=$(cd "$(git rev-parse --git-common-dir)" && pwd)
    docker compose --progress quiet run --rm -T -v "$common:$common" app "$@"
  else
    docker compose --progress quiet run --rm -T app "$@"
  fi
}
