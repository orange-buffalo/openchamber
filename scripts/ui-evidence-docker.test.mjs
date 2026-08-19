import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  containerCreateArgs,
  dockerCaptureOptions,
} from "./ui-evidence-docker.mjs";

test("forwards capture state while keeping output on the host", () => {
  const options = dockerCaptureOptions([
    "--label",
    "after-settings",
    "--theme",
    "dark",
    "--scenario",
    "assistant-response",
    "--setup-script",
    "./scenario.mjs",
    "--output",
    "./evidence",
  ]);

  assert.deepEqual(options.forwarded, [
    "--label",
    "after-settings",
    "--theme",
    "dark",
    "--scenario",
    "assistant-response",
  ]);
  assert.equal(options.setupSource, path.resolve("./scenario.mjs"));
  assert.equal(options.output, path.resolve("./evidence"));
});

test("rejects options that would cross the container boundary", () => {
  assert.throws(
    () => dockerCaptureOptions(["--url", "value"]),
    /use bun run ui:evidence:local/,
  );
  assert.throws(
    () => dockerCaptureOptions(["--headed"]),
    /use bun run ui:evidence:local/,
  );
});

test("creates an offline container without host mounts", () => {
  const args = containerCreateArgs(
    "evidence-container",
    ["--label", "after-settings"],
    "window.prepareEvidence = true;",
  );

  assert.deepEqual(args.slice(0, 6), [
    "create",
    "--name",
    "evidence-container",
    "--network",
    "none",
    "--env",
  ]);
  assert.match(args[6], /^OPENCHAMBER_UI_EVIDENCE_SETUP_SOURCE=/);
  assert.equal(args.includes("--mount"), false);
  assert.equal(args.includes("--volume"), false);
  assert.equal(args.includes("-v"), false);
});
