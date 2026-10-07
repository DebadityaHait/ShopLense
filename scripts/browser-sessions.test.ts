// @vitest-environment node
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
const require = createRequire(import.meta.url);
const { openArguments, sessionUrl, sessionConfig, isClosedSession } = require("./browser-sessions.js");
const { parseArgs } = require("./swiggy-location-cookie.js");
afterEach(() => vi.unstubAllEnvs());

describe("headless session lifecycle", () => {
  it("starts persistent Chrome without headed mode by default", () => {
    expect(openArguments("zepto_normal", "https://www.zepto.com/"))
      .toEqual(["-s=zepto_normal", "open", "--browser=chrome", "--persistent", "https://www.zepto.com/"]);
  });
  it("requires an explicit headed option for visible setup", () => {
    expect(openArguments("swiggy_normal", "https://www.swiggy.com/", true)).toContain("--headed");
    expect(parseArgs(["--lat", "12", "--lon", "80"]).headed).toBeFalsy();
    expect(parseArgs(["--lat", "12", "--lon", "80", "--headed"]).headed).toBe(true);
  });
  it("resolves configured sessions without allowing arbitrary startup targets", () => {
    vi.stubEnv("BLINKIT_PLAYWRIGHT_SESSION", "my_blinkit");
    expect(sessionUrl("my_blinkit")).toBe("https://blinkit.com/");
    expect(sessionUrl("unknown")).toBeUndefined();
    expect(() => sessionConfig("UNKNOWN")).toThrow("Unknown browser vendor");
  });
  it("restarts closed sessions but not blocked or rate-limited sessions", () => {
    expect(isClosedSession({ stdout: "Browser 'zepto_normal' is not open." })).toBe(true);
    expect(isClosedSession({ stderr: "No open browser" })).toBe(true);
    expect(isClosedSession({ stdout: "HTTP 403 access denied" })).toBe(false);
    expect(isClosedSession({ stdout: "HTTP 429" })).toBe(false);
  });
  it("rejects missing or invalid coordinates before browser startup", () => {
    vi.stubEnv("SWIGGY_LAT", "");
    vi.stubEnv("SWIGGY_LON", "");
    expect(() => parseArgs([])).toThrow("Usage");
    expect(() => parseArgs(["--lat", "91", "--lon", "80"])).toThrow("Usage");
    expect(() => parseArgs(["--lat", "12", "--lon", "181"])).toThrow("Usage");
  });
  it("reopens an idle catalog session headlessly before retrying its operation", () => {
    const source = `
      const runner = require('./scripts/playwright-runner');
      const calls=[];
      runner.runPlaywrightAsync = async (args, options) => {
        calls.push({args,headless:options?.env?.PLAYWRIGHT_MCP_HEADLESS});
        if(calls.length===1) throw Object.assign(new Error('closed'),{stderr:'Browser is not open'});
        return args.includes('open') ? '' : '### Result\\n{"count":1}';
      };
      require('./scripts/browser-catalog').runCatalogCode('zepto_normal','async page => ({count:1})')
        .then(result=>console.log(JSON.stringify({result,calls}))).catch(()=>process.exit(1));
    `;
    const result = JSON.parse(execFileSync(process.execPath, ["-e", source], {
      cwd: path.resolve(import.meta.dirname, ".."), encoding: "utf8",
      env: { ...process.env, ZEPTO_PLAYWRIGHT_SESSION: "zepto_normal" },
    }));
    expect(result.result).toEqual({ count: 1 });
    expect(result.calls).toHaveLength(3);
    expect(result.calls[1].args).toContain("open");
    expect(result.calls[1].args).not.toContain("--headed");
    expect(result.calls[1].headless).toBe("true");
  });
  it("does not restart or use headed fallback after an upstream denial", () => {
    const source = `
      const runner=require('./scripts/playwright-runner'); let calls=0;
      runner.runPlaywrightAsync=async()=>{calls++;throw Object.assign(new Error('denied'),{stderr:'HTTP 403'});};
      require('./scripts/browser-catalog').runCatalogCode('zepto_normal','async page => ({})')
        .catch(error=>console.log(JSON.stringify({calls,message:error.message})));
    `;
    const result = JSON.parse(execFileSync(process.execPath, ["-e", source], {
      cwd: path.resolve(import.meta.dirname, ".."), encoding: "utf8",
    }));
    expect(result.calls).toBe(1);
    expect(result.message).toContain("no headed fallback");
  });
});
