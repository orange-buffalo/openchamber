#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { SCREENSHOT_DIRECTORY } from "../packages/web/server/lib/openchamber-control/screenshots.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const image = "openchamber-ui-evidence:local";
const containerOutput = `/workspace/openchamber/${SCREENSHOT_DIRECTORY}`;

const valueAfter = (argv, index, option) => {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
};

export const dockerCaptureOptions = (argv) => {
  const forwarded = [];
  let output = path.join(repoRoot, SCREENSHOT_DIRECTORY);
  let setupSource = null;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help") {
      help = true;
      forwarded.push(value);
    } else if (value === "--output") {
      output = path.resolve(valueAfter(argv, index++, value));
    } else if (value === "--setup-script") {
      setupSource = path.resolve(valueAfter(argv, index++, value));
    } else if (["--url", "--headed"].includes(value)) {
      throw new Error(
        `${value} requires an explicitly managed environment; use bun run ui:evidence:local`,
      );
    } else {
      forwarded.push(value);
    }
  }

  return { forwarded, help, output, setupSource };
};

export const containerCreateArgs = (containerName, forwarded, setupSource) => {
  const args = ["create", "--name", containerName, "--network", "none"];
  if (setupSource) {
    args.push("--env", `OPENCHAMBER_UI_EVIDENCE_SETUP_SOURCE=${setupSource}`);
  }
  args.push(image, ...forwarded);
  return args;
};

const run = (command, args, { capture = false } = {}) =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    });
    let stdout = "";
    if (capture) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
    }
    child.once("error", (error) => rejectRun(error));
    child.once("close", (code, signal) => {
      if (code === 0) resolveRun(stdout.trim());
      else {
        rejectRun(
          new Error(
            `${command} ${args[0]} failed (code ${code}, signal ${signal})`,
          ),
        );
      }
    });
  });

const main = async () => {
  const options = dockerCaptureOptions(process.argv.slice(2));
  if (options.help) {
    await run("node", ["scripts/ui-evidence.mjs", "--help"]);
    console.log(
      "\nThe default command runs in Docker. Host URLs and headed mode require ui:evidence:local.",
    );
    return;
  }

  console.log("[ui:evidence] Building disposable capture image");
  await run("docker", [
    "build",
    "--file",
    "scripts/ui-evidence.Dockerfile",
    "--tag",
    image,
    ".",
  ]);

  const containerName = `openchamber-ui-evidence-${randomUUID()}`;
  let containerId = null;
  try {
    const setupSource = options.setupSource
      ? await readFile(options.setupSource, "utf8")
      : null;
    const createArgs = containerCreateArgs(
      containerName,
      options.forwarded,
      setupSource,
    );
    containerId = await run("docker", createArgs, { capture: true });
    await run("docker", ["start", "--attach", containerId]);
    await mkdir(options.output, { recursive: true });
    await run("docker", [
      "cp",
      `${containerId}:${containerOutput}/.`,
      options.output,
    ]);
    console.log(`[ui:evidence] Copied evidence to ${options.output}`);
  } catch (error) {
    if (containerId) {
      console.error("[ui:evidence] Disposable container logs:");
      await run("docker", ["logs", containerId]).catch(() => {});
    }
    throw error;
  } finally {
    if (containerId) {
      await run("docker", ["rm", "--force", containerId]).catch((error) => {
        console.warn(
          `[ui:evidence] Container cleanup failed: ${error.message}`,
        );
      });
    }
  }
};

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`ui:evidence: ${error.message}`);
    process.exit(1);
  });
}
