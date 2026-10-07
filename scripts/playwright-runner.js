"use strict";

const { execFileSync, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const fs = require("node:fs");
const path = require("node:path");

function resolvePlaywrightCommand(bin = process.env.PLAYWRIGHT_CLI || "playwright-cli") {
  if (bin.endsWith(".js")) return [process.execPath, [bin]];
  // Windows cannot exec npm's .cmd/.ps1 wrappers directly. Run their JS entrypoint without a shell.
  if (process.platform === "win32" && /^playwright-cli(?:\.cmd|\.ps1)?$/i.test(path.basename(bin))) {
    const directories = path.isAbsolute(bin) ? [path.dirname(bin)] : (process.env.PATH || "").split(path.delimiter);
    for (const directory of directories) {
      const entries = [
        path.join(directory, "node_modules", "@playwright", "cli", "playwright-cli.js"),
        path.resolve(directory, "..", "@playwright", "cli", "playwright-cli.js"),
      ];
      const entry = entries.find((file) => fs.existsSync(file));
      if (entry) return [process.execPath, [entry]];
    }
  }
  return [bin, []];
}

function runPlaywright(args, options = {}) {
  const [command, prefix] = resolvePlaywrightCommand();
  return execFileSync(command, [...prefix, ...args], {
    encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"], ...options,
  });
}

async function runPlaywrightAsync(args, options = {}) {
  const [command, prefix] = resolvePlaywrightCommand();
  const { stdout } = await promisify(execFile)(command, [...prefix, ...args], {
    encoding: "utf8", timeout: 20000, maxBuffer: 8 * 1024 * 1024, ...options,
  });
  return stdout;
}

module.exports = { runPlaywright, runPlaywrightAsync, resolvePlaywrightCommand };
