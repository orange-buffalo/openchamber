#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import {
  SCREENSHOT_DIRECTORY,
  screenshotSlug,
} from "../packages/web/server/lib/openchamber-control/screenshots.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DEFAULT_SCENARIO = "assistant-response";
const DEFAULT_TIMEOUT_MS = 60_000;
const SENSITIVE_QUERY = /token|secret|password|auth|key|code|credential/i;

const HELP = `Usage: bun run ui:evidence -- --label <name> [options]

Captures a deterministic production-component fixture with Playwright at desktop
(1440x900) and hosted-mobile (390x844) layouts. No OpenChamber or OpenCode server
is started.

Options:
  --label <name>            Evidence label, such as after-assistant-card (required)
  --scenario <name>         Fixture scenario (default: ${DEFAULT_SCENARIO})
  --url <url>               Use an already-running visual fixture Vite server
  --setup-script <path>     Browser-side JavaScript run before each capture
  --selector <selector>     Require this element on both surfaces before capture
  --desktop-selector <sel>  Require this element on the desktop surface
  --mobile-selector <sel>   Require this element on the mobile surface
  --theme <light|dark>      Color scheme for both captures (default: light)
  --wait-ms <milliseconds>  Extra settling time after setup (default: 250)
  --output <directory>      Output directory (default: .openchamber/screenshots)
  --headed                  Show Chromium instead of running headless
  --help                    Show this help

The setup script is the body of an async browser function. It receives surface
("desktop" or "mobile") and viewport ({ width, height }).`;

const optionValue = (argv, index, option) => {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
};

export const parseArgs = (argv) => {
  const options = {
    label: null,
    scenario: DEFAULT_SCENARIO,
    url: null,
    setupScript: null,
    selector: null,
    desktopSelector: null,
    mobileSelector: null,
    theme: "light",
    waitMs: 250,
    output: path.join(repoRoot, SCREENSHOT_DIRECTORY),
    headless: true,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    switch (value) {
      case "--help":
        options.help = true;
        break;
      case "--headed":
        options.headless = false;
        break;
      case "--label":
        options.label = optionValue(argv, index++, value);
        break;
      case "--scenario":
        options.scenario = optionValue(argv, index++, value);
        break;
      case "--url":
        options.url = optionValue(argv, index++, value);
        break;
      case "--setup-script":
        options.setupScript = optionValue(argv, index++, value);
        break;
      case "--selector":
        options.selector = optionValue(argv, index++, value);
        break;
      case "--desktop-selector":
        options.desktopSelector = optionValue(argv, index++, value);
        break;
      case "--mobile-selector":
        options.mobileSelector = optionValue(argv, index++, value);
        break;
      case "--theme":
        options.theme = optionValue(argv, index++, value);
        break;
      case "--wait-ms":
        options.waitMs = Number(optionValue(argv, index++, value));
        break;
      case "--output":
        options.output = path.resolve(optionValue(argv, index++, value));
        break;
      default:
        throw new Error(`Unknown option: ${value}`);
    }
  }

  if (options.help) return options;
  if (!options.label?.trim()) throw new Error("--label is required");
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(options.scenario)) {
    throw new Error(
      "--scenario must contain only letters, numbers, and hyphens",
    );
  }
  if (!["light", "dark"].includes(options.theme)) {
    throw new Error("--theme must be light or dark");
  }
  if (!Number.isFinite(options.waitMs) || options.waitMs < 0) {
    throw new Error("--wait-ms must be a non-negative number");
  }
  if (options.url) new URL(options.url);
  return options;
};

export const fixtureUrlFor = (baseUrl, scenario, surface, theme) => {
  const url = new URL("/visual-fixture.html", baseUrl);
  url.searchParams.set("scenario", scenario);
  url.searchParams.set("surface", surface);
  url.searchParams.set("themeMode", theme);
  return url.toString();
};

const isolatedRuntimeDirectories = (runtimeDir) => {
  const home = path.join(runtimeDir, "home");
  return {
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(runtimeDir, "app-data", "roaming"),
    LOCALAPPDATA: path.join(runtimeDir, "app-data", "local"),
    XDG_CACHE_HOME: path.join(runtimeDir, "xdg-cache"),
    XDG_CONFIG_HOME: path.join(runtimeDir, "xdg-config"),
    XDG_DATA_HOME: path.join(runtimeDir, "xdg-data"),
    XDG_STATE_HOME: path.join(runtimeDir, "xdg-state"),
    TMPDIR: path.join(runtimeDir, "tmp"),
    TMP: path.join(runtimeDir, "tmp"),
    TEMP: path.join(runtimeDir, "tmp"),
  };
};

const ENVIRONMENT_PASSTHROUGH = [
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "NO_COLOR",
  "PATH",
  "SHELL",
  "TERM",
  "PLAYWRIGHT_BROWSERS_PATH",
];

export const isolatedRuntimeEnvironment = (
  runtimeDir,
  inheritedEnvironment = process.env,
) => {
  const environment = isolatedRuntimeDirectories(runtimeDir);
  for (const key of ENVIRONMENT_PASSTHROUGH) {
    if (inheritedEnvironment[key] !== undefined) {
      environment[key] = inheritedEnvironment[key];
    }
  }
  environment.OPENCHAMBER_DISABLE_PWA_DEV = "1";
  return environment;
};

const reservePort = () =>
  new Promise((resolvePort, rejectPort) => {
    const server = net.createServer();
    server.unref();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && "port" in address ? address.port : null;
      if (!Number.isInteger(port)) {
        server.close();
        rejectPort(new Error("Could not reserve a Vite port"));
        return;
      }
      server.close((error) => {
        if (error) rejectPort(error);
        else resolvePort(port);
      });
    });
  });

const waitForHttp = async (url, child, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `Vite exited before the visual fixture was ready (code ${child.exitCode}, signal ${child.signalCode})`,
      );
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error(
    `Timed out waiting for ${url}: ${lastError?.message ?? "no response"}`,
  );
};

const stopChild = async (child) => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const target = process.platform === "win32" ? child.pid : -child.pid;
  try {
    process.kill(target, "SIGTERM");
  } catch {
    return;
  }
  await Promise.race([
    new Promise((resolveClose) => child.once("close", resolveClose)),
    new Promise((resolveWait) => setTimeout(resolveWait, 3_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(target, "SIGKILL");
    } catch {
      // The process exited between the state check and signal.
    }
  }
};

const safeUrl = (value) => {
  const url = new URL(value);
  for (const key of [...url.searchParams.keys()]) {
    if (SENSITIVE_QUERY.test(key)) url.searchParams.set(key, "[REDACTED]");
  }
  return url.toString();
};

const fileStamp = (date) =>
  date.toISOString().replace(/[:.]/g, "-").replace("Z", "");

const reportedPath = (absolutePath) =>
  path.relative(repoRoot, absolutePath).split(path.sep).join("/");

const setupSourceFor = async (options) => {
  if (options.setupScript) return readFile(options.setupScript, "utf8");
  return process.env.OPENCHAMBER_UI_EVIDENCE_SETUP_SOURCE ?? null;
};

const surfaceDefinitions = [
  {
    name: "desktop",
    runtime: "web-desktop",
    viewport: { width: 1440, height: 900 },
    mobile: false,
  },
  {
    name: "mobile",
    runtime: "hosted-mobile-web",
    viewport: { width: 390, height: 844 },
    mobile: true,
  },
];

const captureSurface = async ({
  browser,
  baseUrl,
  options,
  output,
  setupSource,
  stamp,
  surface,
}) => {
  const context = await browser.newContext({
    viewport: surface.viewport,
    colorScheme: options.theme,
    isMobile: surface.mobile,
    hasTouch: surface.mobile,
    deviceScaleFactor: 1,
  });
  try {
    await context.addInitScript((theme) => {
      localStorage.setItem("themeMode", theme);
    }, options.theme);
    const page = await context.newPage();
    page.on("pageerror", (error) => {
      console.error(
        `[ui:evidence] ${surface.name} page error: ${error.message}`,
      );
    });
    const url = fixtureUrlFor(
      baseUrl,
      options.scenario,
      surface.name,
      options.theme,
    );
    console.log(`[ui:evidence] Preparing ${surface.name}: ${safeUrl(url)}`);
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: DEFAULT_TIMEOUT_MS,
    });
    await page.locator("[data-visual-fixture-ready]").waitFor({
      state: "visible",
      timeout: DEFAULT_TIMEOUT_MS,
    });

    if (setupSource) {
      await page.evaluate(
        async ({ source, surfaceName, viewport }) => {
          const setup = new Function(
            "surface",
            "viewport",
            `return (async () => {\n${source}\n})();`,
          );
          await setup(surfaceName, viewport);
        },
        {
          source: setupSource,
          surfaceName: surface.name,
          viewport: surface.viewport,
        },
      );
    }

    const surfaceSelector =
      surface.name === "desktop"
        ? options.desktopSelector
        : options.mobileSelector;
    const requiredSelector = surfaceSelector ?? options.selector;
    if (requiredSelector) {
      await page.locator(requiredSelector).waitFor({
        state: "visible",
        timeout: DEFAULT_TIMEOUT_MS,
      });
    }

    await page.addStyleTag({
      content:
        "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
    });
    if (options.waitMs > 0) await page.waitForTimeout(options.waitMs);

    const actualViewport = page.viewportSize();
    if (
      actualViewport?.width !== surface.viewport.width ||
      actualViewport.height !== surface.viewport.height
    ) {
      throw new Error(
        `${surface.name} viewport is ${actualViewport?.width}x${actualViewport?.height}, expected ${surface.viewport.width}x${surface.viewport.height}`,
      );
    }

    const filename = `${screenshotSlug(`${options.label}-${surface.name}`)}-${stamp}.png`;
    const absolutePath = path.join(output, filename);
    await page.screenshot({
      path: absolutePath,
      type: "png",
      animations: "disabled",
      caret: "hide",
    });

    return {
      runtime: surface.runtime,
      surface: surface.name,
      scenario: options.scenario,
      theme: options.theme,
      viewport: surface.viewport,
      title: await page.title(),
      url: safeUrl(page.url()),
      path: reportedPath(absolutePath),
      setupScriptApplied: Boolean(setupSource),
    };
  } finally {
    await context.close();
  }
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return;
  }

  const runtimeDir = await mkdtemp(
    path.join(tmpdir(), "openchamber-ui-evidence-runtime-"),
  );
  let vite = null;
  let browser = null;
  let stopping = false;
  const cleanup = async () => {
    if (stopping) return;
    stopping = true;
    await browser?.close().catch(() => {});
    await stopChild(vite);
    await rm(runtimeDir, { recursive: true, force: true });
  };
  const onSignal = () => {
    void cleanup().finally(() => process.exit(130));
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    let baseUrl = options.url;
    if (!baseUrl) {
      const port = await reservePort();
      baseUrl = `http://127.0.0.1:${port}`;
      vite = spawn(
        "bunx",
        [
          "vite",
          "--config",
          "packages/web/vite.config.ts",
          "--host",
          "127.0.0.1",
          "--port",
          String(port),
          "--strictPort",
        ],
        {
          cwd: repoRoot,
          env: isolatedRuntimeEnvironment(runtimeDir),
          stdio: ["ignore", "inherit", "inherit"],
          detached: process.platform !== "win32",
          windowsHide: true,
        },
      );
      await waitForHttp(
        fixtureUrlFor(baseUrl, options.scenario, "desktop", options.theme),
        vite,
      );
    }

    await mkdir(options.output, { recursive: true });
    const setupSource = await setupSourceFor(options);
    browser = await chromium.launch({ headless: options.headless });
    const capturedAt = new Date();
    const stamp = fileStamp(capturedAt);
    const artifacts = [];
    for (const surface of surfaceDefinitions) {
      artifacts.push(
        await captureSurface({
          browser,
          baseUrl,
          options,
          output: options.output,
          setupSource,
          stamp,
          surface,
        }),
      );
    }

    const manifestPath = path.join(
      options.output,
      `${screenshotSlug(`${options.label}-evidence`)}-${stamp}.json`,
    );
    await writeFile(
      manifestPath,
      `${JSON.stringify(
        {
          label: options.label,
          scenario: options.scenario,
          capturedAt: capturedAt.toISOString(),
          artifacts,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    console.log("\n[ui:evidence] Current visual evidence:");
    for (const artifact of artifacts) {
      const title = artifact.surface === "desktop" ? "Desktop" : "Mobile";
      console.log(`![${title} ${options.label}](${artifact.path})`);
    }
    console.log(`[ui:evidence] Manifest: ${reportedPath(manifestPath)}`);
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    await cleanup();
  }
};

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`ui:evidence: ${error.message}`);
    process.exit(1);
  });
}
