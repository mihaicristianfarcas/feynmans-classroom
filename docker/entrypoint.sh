#!/bin/sh
# Runs the command as the owner of the mounted repository (so files written to it are yours), after
# installing the packages when package-lock.json has changed.
set -eu

if [ "$(id -u)" = 0 ]; then
  uid=$(stat -c %u /app)
  gid=$(stat -c %g /app)
  # Docker Desktop shows mounts as root but lets anyone write; Linux shows the real owner
  if [ "$uid" != 0 ]; then
    [ "$(id -g node)" = "$gid" ] || groupmod -o -g "$gid" node
    [ "$(id -u node)" = "$uid" ] || usermod -o -u "$uid" node
    for dir in /home/node /app/node_modules; do
      [ "$(stat -c %u:%g "$dir")" = "$uid:$gid" ] || chown -R node:node "$dir"
    done
  fi
  if setpriv --reuid=node --regid=node --init-groups test -w /app; then
    exec setpriv --reuid=node --regid=node --init-groups "$0" "$@"
  fi
  # rootless Docker: root in here is you out there, so stay root
fi

want=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ "$(cat node_modules/.lock-sha 2>/dev/null)" != "$want" ]; then
  flock node_modules/.install-lock sh -c '
    [ "$(cat node_modules/.lock-sha 2>/dev/null)" = "$1" ] && exit 0
    npm ci --no-audit --no-fund --loglevel=error >&2 && echo "$1" > node_modules/.lock-sha
  ' sh "$want"
fi

exec "$@"
