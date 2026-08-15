# Ubuntu-based image for running a Root.js CMS project with Node, pnpm, and the
# Google Cloud CLI pre-installed.
#
# The project itself is not baked into the image — mount it at /workspace and
# mount a volume at $HOME/.config/gcloud to persist `gcloud` credentials across
# runs. See ./README.md for the full workflow.

FROM ubuntu:24.04

# Keep NODE_VERSION in sync with /.node-version and PNPM_VERSION with the
# `packageManager` field of the project's package.json.
ARG NODE_VERSION=24.16.0
ARG PNPM_VERSION=11.17.0
ARG USERNAME=rootjs
ARG UID=1000
ARG GID=1000

ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=C.UTF-8

# Base packages. `xz-utils` unpacks the Node tarball, `git` is used by pnpm when
# a dependency resolves to a git ref, and `gnupg`/`python3` are required by the
# Google Cloud CLI.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      git \
      gnupg \
      less \
      openssh-client \
      python3 \
      xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Node.js, from the official tarball, verified against the published checksums.
RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    case "${arch}" in \
      amd64) node_arch='x64' ;; \
      arm64) node_arch='arm64' ;; \
      *) echo "unsupported architecture: ${arch}" >&2; exit 1 ;; \
    esac; \
    tarball="node-v${NODE_VERSION}-linux-${node_arch}.tar.xz"; \
    cd /tmp; \
    curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/${tarball}"; \
    curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"; \
    grep " ${tarball}\$" SHASUMS256.txt | sha256sum -c -; \
    tar -xJf "${tarball}" -C /usr/local --strip-components=1 --no-same-owner \
      --exclude=CHANGELOG.md --exclude=LICENSE --exclude=README.md; \
    rm -f "${tarball}" SHASUMS256.txt; \
    node --version

# pnpm, pinned via corepack. A project whose `packageManager` field requests a
# different version still works — corepack fetches it on demand.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN set -eux; \
    if command -v corepack >/dev/null 2>&1; then \
      corepack enable; \
      corepack prepare "pnpm@${PNPM_VERSION}" --activate; \
    else \
      npm install -g "pnpm@${PNPM_VERSION}"; \
    fi; \
    pnpm --version

# Google Cloud CLI, from the official apt repo.
RUN set -eux; \
    curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
      | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg; \
    echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
      > /etc/apt/sources.list.d/google-cloud-sdk.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends google-cloud-cli; \
    rm -rf /var/lib/apt/lists/*; \
    gcloud --version

# Run as a non-root user so files written to the mounted project keep the host
# user's ownership. Ubuntu 24.04 ships a default `ubuntu` account at uid 1000,
# which is removed here so the requested uid/gid is available.
RUN set -eux; \
    if id -u ubuntu >/dev/null 2>&1; then userdel -r ubuntu 2>/dev/null || userdel ubuntu; fi; \
    if ! getent group "${GID}" >/dev/null; then groupadd --gid "${GID}" "${USERNAME}"; fi; \
    useradd --uid "${UID}" --gid "${GID}" --create-home --shell /bin/bash "${USERNAME}"; \
    mkdir -p "/home/${USERNAME}/.config/gcloud" \
             "/home/${USERNAME}/.local/share/pnpm" \
             "/home/${USERNAME}/.pnpm-store" \
             /workspace; \
    chown -R "${UID}:${GID}" "/home/${USERNAME}" /workspace

COPY --chmod=0755 entrypoint.sh /usr/local/bin/entrypoint.sh

ENV HOME=/home/${USERNAME}
# Global pnpm binaries and the content-addressable store both live under $HOME
# so they can be persisted with a volume.
ENV PNPM_HOME=/home/${USERNAME}/.local/share/pnpm
ENV npm_config_store_dir=/home/${USERNAME}/.pnpm-store
ENV PATH=${PNPM_HOME}:${PATH}
# Consumed by `root dev`, see packages/root/src/cli/dev.ts.
ENV PORT=4007

USER ${UID}:${GID}
WORKDIR /workspace
EXPOSE 4007

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
# `root dev` binds to localhost by default, which is unreachable from outside
# the container.
CMD ["pnpm", "exec", "root", "dev", "--host", "0.0.0.0"]
