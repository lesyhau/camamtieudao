# Runtime image for the Cam Am Tieu Dao web app.
#
# This does NOT build the application. CI (or you, locally) runs `npm ci && npm run build`
# and drops the three Next `standalone` outputs into this directory before `docker compose
# up` builds from here - the same split proxyma-license uses for its jar. Building inside
# the image instead would put a full toolchain and a node_modules tree on the target host
# for something the CI runner has already produced.
#
# Expected beside this file, assembled by the deploy workflow:
#   app/           .next/standalone  (server.js + only the deps actually reached)
#   app/.next/static
#   app/public
# Debian (glibc), NOT alpine (musl). Two reasons, and the first is fatal:
#
#   onnxruntime-node publishes no musl build at all, so the OCR runtime cannot load on alpine.
#
#   And the payload's node_modules is produced by `npm ci` on the ubuntu CI runner, so its
#   optional platform packages are the glibc ones. On alpine that surfaced as
#   "Cannot find module './skia.linux-x64-musl.node'" - a missing file whose name is the only
#   clue that the libc, not the package, was wrong.
#
# Alpine was chosen for size. Correctness wins; slim is not much larger.
FROM node:22-slim

# dumb-init reaps the zombies a Node process left as PID 1 accumulates, and turns SIGTERM
# into a clean shutdown instead of a 10-second wait for docker to lose patience.
RUN apt-get update \
 && apt-get install -y --no-install-recommends dumb-init \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=4249 \
    HOSTNAME=0.0.0.0

WORKDIR /app

# Identifies this build of the application. Next writes a fresh .next/BUILD_ID per build, and
# install.sh passes it in, so this layer changes exactly when the app does.
#
# Without it the COPY below was reported CACHED across genuinely different payloads and the
# container kept serving an older build - the deploy looked green, the site did not change,
# and the only way to see it was to diff the served CSS against the payload on disk.
ARG APP_REV=unknown
RUN echo "build ${APP_REV}" > /app/.build-rev

# node:slim already ships an unprivileged `node` user (uid 1000). Nothing here is written
# at runtime - the app holds no state on disk - so the whole tree can stay read-only to it.
COPY --chown=node:node app/ ./

USER node
EXPOSE 4249

# Next's standalone output is a plain Node server; there is no `next start` in the image.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
