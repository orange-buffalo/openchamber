import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  fixtureUrlFor,
  isolatedRuntimeEnvironment,
  parseArgs,
} from "./ui-evidence.mjs";

test("requires an identifiable evidence label", () => {
  assert.throws(() => parseArgs([]), /--label is required/);
});

test("parses fixture capture options", () => {
  const options = parseArgs([
    "--label",
    "after-response",
    "--scenario",
    "assistant-response",
    "--url",
    "http://127.0.0.1:5180",
    "--theme",
    "dark",
    "--wait-ms",
    "250",
    "--selector",
    '[data-visual-fixture="assistant-response"]',
    "--desktop-selector",
    "#desktop-response",
    "--mobile-selector",
    "#mobile-response",
    "--setup-script",
    "./scenario.mjs",
    "--output",
    "./artifacts",
    "--headed",
  ]);

  assert.equal(options.label, "after-response");
  assert.equal(options.scenario, "assistant-response");
  assert.equal(options.theme, "dark");
  assert.equal(options.waitMs, 250);
  assert.equal(options.selector, '[data-visual-fixture="assistant-response"]');
  assert.equal(options.desktopSelector, "#desktop-response");
  assert.equal(options.mobileSelector, "#mobile-response");
  assert.equal(options.setupScript, "./scenario.mjs");
  assert.equal(options.output, path.resolve("./artifacts"));
  assert.equal(options.headless, false);
});

test("builds strict desktop and mobile fixture URLs", () => {
  assert.equal(
    fixtureUrlFor(
      "http://127.0.0.1:5180/ignored",
      "assistant-response",
      "mobile",
      "dark",
    ),
    "http://127.0.0.1:5180/visual-fixture.html?scenario=assistant-response&surface=mobile&themeMode=dark",
  );
});

test("rejects unsupported fixture values", () => {
  assert.throws(
    () => parseArgs(["--label", "after", "--scenario", "../../secret"]),
    /--scenario must contain only/,
  );
  assert.throws(
    () => parseArgs(["--label", "after", "--theme", "system"]),
    /--theme must be light or dark/,
  );
  assert.throws(
    () => parseArgs(["--label", "after", "--wait-ms", "-1"]),
    /--wait-ms must be a non-negative number/,
  );
});

test("isolates Vite from inherited application and credential state", () => {
  const runtimeDir = "/tmp/openchamber-ui-evidence-runtime";
  const environment = isolatedRuntimeEnvironment(runtimeDir, {
    PATH: "/usr/bin",
    PLAYWRIGHT_BROWSERS_PATH: "/ms-playwright",
    GH_TOKEN: "host-github-token",
    OPENCODE_HOST: "http://127.0.0.1:4095",
    HOME: "/home/developer",
  });

  assert.equal(environment.PATH, "/usr/bin");
  assert.equal(environment.PLAYWRIGHT_BROWSERS_PATH, "/ms-playwright");
  assert.equal(environment.OPENCHAMBER_DISABLE_PWA_DEV, "1");
  assert.equal(environment.GH_TOKEN, undefined);
  assert.equal(environment.OPENCODE_HOST, undefined);
  assert.equal(environment.HOME.startsWith(`${runtimeDir}/`), true);
  assert.equal(environment.XDG_CONFIG_HOME.startsWith(`${runtimeDir}/`), true);
});
