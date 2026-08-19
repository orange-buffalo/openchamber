FROM orange-buffalo/agents-base

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

USER 1000:1000
WORKDIR /workspace/openchamber

COPY --chown=1000:1000 package.json bun.lock ./
COPY --chown=1000:1000 bun-patches ./bun-patches
COPY --chown=1000:1000 packages/ui/package.json ./packages/ui/
COPY --chown=1000:1000 packages/web/package.json ./packages/web/
COPY --chown=1000:1000 packages/electron/package.json ./packages/electron/
COPY --chown=1000:1000 packages/vscode/package.json ./packages/vscode/
COPY --chown=1000:1000 packages/mobile/package.json ./packages/mobile/
RUN bun install --frozen-lockfile --ignore-scripts

USER root
RUN bunx playwright install --with-deps chromium

COPY --chown=1000:1000 . /workspace/openchamber
RUN rm -rf .openchamber/screenshots \
  && mkdir -p .openchamber/screenshots \
  && chown -R 1000:1000 .openchamber

USER 1000:1000
ENTRYPOINT ["node", "scripts/ui-evidence.mjs"]
