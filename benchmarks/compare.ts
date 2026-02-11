#!/usr/bin/env npx tsx
/**
 * Browser comparison benchmark: Chrome vs Lightpanda
 *
 * Run with: npx tsx benchmarks/compare.ts
 *
 * Prerequisites:
 * - Chrome installed
 * - Lightpanda installed and available in PATH
 */

import puppeteer from "puppeteer-core";
import { spawn, ChildProcess, execSync } from "child_process";

const LIGHTPANDA_PORT = 9222;
const ITERATIONS = 5;
const TEST_URL = "https://example.com";

interface BenchmarkResult {
  browser: string;
  metric: string;
  avg: number;
  min: number;
  max: number;
}

async function measure<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const result = await fn();
  return [result, performance.now() - start];
}

function getChromePath(): string {
  const paths = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ];
  for (const p of paths) {
    try {
      execSync(`test -f "${p}"`, { stdio: "ignore" });
      return p;
    } catch {
      continue;
    }
  }
  throw new Error("Chrome not found");
}

async function startLightpanda(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "lightpanda",
      ["serve", "--host", "127.0.0.1", "--port", String(LIGHTPANDA_PORT)],
      { stdio: "ignore" },
    );
    proc.on("error", reject);
    setTimeout(() => resolve(proc), 1500);
  });
}

async function benchmarkChrome(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const startupTimes: number[] = [];
  const navigationTimes: number[] = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const [browser, startupTime] = await measure(() =>
      puppeteer.launch({
        executablePath: getChromePath(),
        headless: true,
        args: ["--no-sandbox", "--disable-gpu"],
      }),
    );
    startupTimes.push(startupTime);

    const page = await browser.newPage();
    const [, navTime] = await measure(() =>
      page.goto(TEST_URL, { waitUntil: "domcontentloaded" }),
    );
    navigationTimes.push(navTime);

    await browser.close();
  }

  results.push({
    browser: "Chrome",
    metric: "Startup",
    avg: avg(startupTimes),
    min: Math.min(...startupTimes),
    max: Math.max(...startupTimes),
  });
  results.push({
    browser: "Chrome",
    metric: "Navigation",
    avg: avg(navigationTimes),
    min: Math.min(...navigationTimes),
    max: Math.max(...navigationTimes),
  });

  return results;
}

async function benchmarkLightpanda(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const startupTimes: number[] = [];
  const navigationTimes: number[] = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const [proc, startupTime] = await measure(() => startLightpanda());
    startupTimes.push(startupTime);

    const browser = await puppeteer.connect({
      browserWSEndpoint: `ws://127.0.0.1:${LIGHTPANDA_PORT}`,
    });

    const page = await browser.newPage();
    const [, navTime] = await measure(() =>
      page.goto(TEST_URL, { waitUntil: "domcontentloaded" }),
    );
    navigationTimes.push(navTime);

    await browser.disconnect();
    proc.kill();
    await new Promise((r) => setTimeout(r, 500));
  }

  results.push({
    browser: "Lightpanda",
    metric: "Startup",
    avg: avg(startupTimes),
    min: Math.min(...startupTimes),
    max: Math.max(...startupTimes),
  });
  results.push({
    browser: "Lightpanda",
    metric: "Navigation",
    avg: avg(navigationTimes),
    min: Math.min(...navigationTimes),
    max: Math.max(...navigationTimes),
  });

  return results;
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function formatTable(results: BenchmarkResult[]): void {
  console.log("\n=== Browser Comparison Results ===\n");
  console.log(
    "| Browser    | Metric     | Avg (ms)  | Min (ms)  | Max (ms)  |",
  );
  console.log(
    "|------------|------------|-----------|-----------|-----------|",
  );
  for (const r of results) {
    console.log(
      `| ${r.browser.padEnd(10)} | ${r.metric.padEnd(10)} | ${r.avg.toFixed(1).padStart(9)} | ${r.min.toFixed(1).padStart(9)} | ${r.max.toFixed(1).padStart(9)} |`,
    );
  }

  // Calculate speedup
  const chromeStartup = results.find(
    (r) => r.browser === "Chrome" && r.metric === "Startup",
  );
  const lpStartup = results.find(
    (r) => r.browser === "Lightpanda" && r.metric === "Startup",
  );
  if (chromeStartup && lpStartup) {
    const speedup = chromeStartup.avg / lpStartup.avg;
    console.log(`\nStartup speedup: ${speedup.toFixed(1)}x`);
  }
}

async function main() {
  console.log(`Running ${ITERATIONS} iterations per browser...\n`);

  console.log("Benchmarking Chrome...");
  const chromeResults = await benchmarkChrome();

  console.log("Benchmarking Lightpanda...");
  const lpResults = await benchmarkLightpanda();

  formatTable([...chromeResults, ...lpResults]);
}

main().catch(console.error);
