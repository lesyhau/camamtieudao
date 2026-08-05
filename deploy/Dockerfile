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
FROM node:22-alpine

# dumb-init reaps the zombies a Node process left as PID 1 accumulates, and turns SIGTERM
# into a clean shutdown instead of a 10-second wait for docker to lose patience.
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production \
    PORT=4249 \
    HOSTNAME=0.0.0.0

WORKDIR /app

# node:alpine already ships an unprivileged `node` user (uid 1000). Nothing here is written
# at runtime - the app holds no state on disk - so the whole tree can stay read-only to it.
COPY --chown=node:node app/ ./

USER node
EXPOSE 4249

# Next's standalone output is a plain Node server; there is no `next start` in the image.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
