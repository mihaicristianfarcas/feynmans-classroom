#!/usr/bin/env sh
# Turns on the repository's protections on GitHub (run once, as an admin, after the first push):
#   - the "Protect main" ruleset (.github/rulesets/main.json): changes reach main only through pull
#     requests that pass CI and have a code owner's approval; no force pushes, no deletion. Admins may
#     merge their own pull requests without an approval, but can't push to main either.
#   - private vulnerability reporting, which SECURITY.md asks reporters to use. GitHub offers it only
#     on public repositories, so on a private one this step is skipped: run the script again after
#     making the repository public.
# Needs the GitHub CLI, logged in: gh auth login
#   sh scripts/protect-main.sh
set -eu
cd "$(dirname "$0")/.."
repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
existing=$(gh api "repos/$repo/rulesets" -q '.[] | select(.name == "Protect main") | .id')
if [ -n "$existing" ]; then
  gh api -X PUT "repos/$repo/rulesets/$existing" --input .github/rulesets/main.json >/dev/null
  echo "updated the \"Protect main\" ruleset on $repo"
else
  gh api -X POST "repos/$repo/rulesets" --input .github/rulesets/main.json >/dev/null
  echo "created the \"Protect main\" ruleset on $repo"
fi
if [ "$(gh repo view --json isPrivate -q .isPrivate)" = "true" ]; then
  echo "skipped private vulnerability reporting: GitHub offers it only on public repositories"
  echo "  (run this script again after making $repo public)"
else
  gh api -X PUT "repos/$repo/private-vulnerability-reporting" >/dev/null
  echo "turned on private vulnerability reporting"
fi
