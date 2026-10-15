# The development environment: Node, Jujutsu, Chromium, the agents' sandbox and both model CLIs.
# The source is mounted, not copied (compose.yaml, docs/docker.md).

FROM node:24.22.0-trixie-slim@sha256:7f486cabe892bff8fef04c0f7da8dba84a560be3e4e2740b7a86afc57ebec315 AS base

FROM base AS jj
ARG TARGETARCH
# keep in step with .github/actions/setup-jj
ARG JJ_VERSION=0.46.0
ARG JJ_RELEASE=https://github.com/jj-vcs/jj/releases/download/v${JJ_VERSION}/jj-v${JJ_VERSION}
ADD --checksum=sha256:fce0271158e665ceb82dc66c5eb95b1728649094e9133074f3b5baece345fc08 \
  ${JJ_RELEASE}-x86_64-unknown-linux-musl.tar.gz /tmp/amd64.tar.gz
ADD --checksum=sha256:80e28f7501c11e50e0ca06cd6a1fa1d982cff9cc59bfe4411a9d36aa501d867e \
  ${JJ_RELEASE}-aarch64-unknown-linux-musl.tar.gz /tmp/arm64.tar.gz
RUN tar -xzf "/tmp/${TARGETARCH}.tar.gz" -C /usr/local/bin ./jj

FROM base
# trixie for git >= 2.42 (jj needs it); bubblewrap and socat for the agents' sandbox.
# Not pinned: Debian drops superseded versions, so pins would break the build.
# hadolint ignore=DL3008
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bubblewrap ca-certificates chromium curl fonts-liberation git ripgrep socat \
  && rm -rf /var/lib/apt/lists/*

ARG CODEX_VERSION=0.162.1
ARG CLAUDE_CODE_VERSION=2.1.300
RUN npm install -g "@openai/codex@${CODEX_VERSION}" "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
  && npm cache clean --force

COPY --from=jj /usr/local/bin/jj /usr/local/bin/jj
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/entrypoint

RUN git config --system --add safe.directory '*' \
  && mkdir -p /app/node_modules /home/node/.claude /home/node/.codex \
  && chown -R node:node /app /home/node

ENV HOME=/home/node \
  NPM_CONFIG_UPDATE_NOTIFIER=false \
  HOST=0.0.0.0 \
  CHROME_PATH=/usr/bin/chromium \
  CLAUDE_CONFIG_DIR=/home/node/.claude

WORKDIR /app
EXPOSE 8787 5173
# starts as root only to take the mounted repository's owner, then runs as node
ENTRYPOINT ["entrypoint"]
CMD ["node", "scripts/dev.mjs"]
