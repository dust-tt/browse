import { Stagehand, Page } from "@browserbasehq/stagehand";
import { chromium, Browser } from "playwright";

interface BenchmarkResult {
  operation: string;
  mode: "stagehand-only" | "with-playwright";
  runs: number;
  successes: number;
  failures: number;
  successRate: number;
  timings: {
    min: number;
    max: number;
    mean: number;
    median: number;
  };
}

interface RunResult {
  success: boolean;
  duration: number;
  error?: string;
}

const RUNS_PER_TEST = 10;
const TEST_URL = "https://example.com";
const TEST_URL_2 = "https://www.wikipedia.org";

// Check for required environment variables
function checkEnvironment(): void {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    console.warn("⚠️  Warning: No ANTHROPIC_API_KEY or OPENAI_API_KEY found.");
    console.warn(
      "   Stagehand may fail to initialize. Set one of these environment variables.",
    );
    console.warn("   Example: export ANTHROPIC_API_KEY=your_key_here\n");
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function measureTime<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  return { result, duration };
}

function calculateStats(timings: number[]): {
  min: number;
  max: number;
  mean: number;
  median: number;
} {
  const sorted = [...timings].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
    median: sorted[Math.floor(sorted.length / 2)],
  };
}

async function runBenchmark(
  fn: () => Promise<void>,
  runs: number = RUNS_PER_TEST,
): Promise<{ successes: number; failures: number; timings: number[] }> {
  const results: RunResult[] = [];

  for (let i = 0; i < runs; i++) {
    try {
      const { duration } = await measureTime(fn);
      results.push({ success: true, duration });
      console.log(`  Run ${i + 1}/${runs}: ✓ (${duration.toFixed(2)}ms)`);
    } catch (error: any) {
      results.push({
        success: false,
        duration: 0,
        error: error.message,
      });
      console.log(`  Run ${i + 1}/${runs}: ✗ (${error.message})`);
    }
    await sleep(100); // Small delay between runs
  }

  const successes = results.filter((r) => r.success).length;
  const failures = results.filter((r) => !r.success).length;
  const timings = results.filter((r) => r.success).map((r) => r.duration);

  return { successes, failures, timings };
}

// Test 1: Page Navigation (goto)
async function benchmarkGoto(
  stagehand: Stagehand,
  stagehandPage: Page,
  playwrightPage?: Page,
): Promise<BenchmarkResult> {
  const mode = playwrightPage ? "with-playwright" : "stagehand-only";
  console.log(`\n[${mode}] Testing: Page Navigation (goto)`);

  const { successes, failures, timings } = await runBenchmark(async () => {
    const page = playwrightPage ?? stagehandPage;
    const response = await page.goto(TEST_URL, {
      waitUntil: "domcontentloaded",
    });
    if (!response || !response.ok()) {
      throw new Error("Navigation failed");
    }
  });

  return {
    operation: "goto",
    mode,
    runs: RUNS_PER_TEST,
    successes,
    failures,
    successRate: (successes / RUNS_PER_TEST) * 100,
    timings:
      timings.length > 0
        ? calculateStats(timings)
        : { min: 0, max: 0, mean: 0, median: 0 },
  };
}

// Test 2: Dumping Page Content
async function benchmarkDumpContent(
  stagehand: Stagehand,
  stagehandPage: Page,
  playwrightPage?: Page,
): Promise<BenchmarkResult> {
  const mode = playwrightPage ? "with-playwright" : "stagehand-only";
  console.log(`\n[${mode}] Testing: Dump Page Content`);

  // Navigate to page first
  const page = playwrightPage ?? stagehandPage;
  await page.goto(TEST_URL, { waitUntil: "domcontentloaded" });
  await sleep(500);

  const { successes, failures, timings } = await runBenchmark(async () => {
    // Playwright uses innerHTML, Stagehand uses innerHtml
    let content: string;
    if (playwrightPage) {
      // Use evaluate to get innerHTML directly from Playwright page
      content = await playwrightPage.evaluate(() => document.body.innerHTML);
    } else {
      content = await stagehandPage.locator("body").innerHtml();
    }
    if (!content || content.length === 0) {
      throw new Error("Failed to get page content");
    }
  });

  return {
    operation: "dump-content",
    mode,
    runs: RUNS_PER_TEST,
    successes,
    failures,
    successRate: (successes / RUNS_PER_TEST) * 100,
    timings:
      timings.length > 0
        ? calculateStats(timings)
        : { min: 0, max: 0, mean: 0, median: 0 },
  };
}

// Test 3: Creating New Pages
async function benchmarkNewPage(
  stagehand: Stagehand,
  playwrightBrowser?: Browser,
): Promise<BenchmarkResult> {
  const mode = playwrightBrowser ? "with-playwright" : "stagehand-only";
  console.log(`\n[${mode}] Testing: Create New Page`);

  const pagesToClose: Page[] = [];

  const { successes, failures, timings } = await runBenchmark(async () => {
    let newPage: Page;
    if (playwrightBrowser) {
      const contexts = playwrightBrowser.contexts();
      if (contexts.length === 0) {
        throw new Error("No browser context available");
      }
      const pwPage = await contexts[0].newPage();
      newPage = pwPage as unknown as Page;
    } else {
      newPage = await stagehand.context.newPage();
    }
    await newPage.goto(TEST_URL_2, { waitUntil: "domcontentloaded" });
    pagesToClose.push(newPage);
  });

  // Cleanup
  for (const page of pagesToClose) {
    try {
      await page.close();
    } catch (_) {
      // Ignore errors during cleanup
    }
  }

  return {
    operation: "new-page",
    mode,
    runs: RUNS_PER_TEST,
    successes,
    failures,
    successRate: (successes / RUNS_PER_TEST) * 100,
    timings:
      timings.length > 0
        ? calculateStats(timings)
        : { min: 0, max: 0, mean: 0, median: 0 },
  };
}

// Test 4: Stagehand Act (Interact)
async function benchmarkAct(
  stagehand: Stagehand,
  stagehandPage: Page,
  playwrightPage?: Page,
): Promise<BenchmarkResult> {
  const mode = playwrightPage ? "with-playwright" : "stagehand-only";
  console.log(`\n[${mode}] Testing: Stagehand Act (Interact)`);

  // Navigate to Wikipedia for interaction
  const page = playwrightPage ?? stagehandPage;
  await page.goto(TEST_URL_2, { waitUntil: "domcontentloaded" });
  await sleep(1000);

  const { successes, failures, timings } = await runBenchmark(async () => {
    const result = await stagehand.act("observe the main heading", { page });

    if (!result.success) {
      throw new Error("Act operation failed");
    }
  });

  return {
    operation: "act-interact",
    mode,
    runs: RUNS_PER_TEST,
    successes,
    failures,
    successRate: (successes / RUNS_PER_TEST) * 100,
    timings:
      timings.length > 0
        ? calculateStats(timings)
        : { min: 0, max: 0, mean: 0, median: 0 },
  };
}

// Test 5: Page URL retrieval
async function benchmarkGetUrl(
  stagehand: Stagehand,
  stagehandPage: Page,
  playwrightPage?: Page,
): Promise<BenchmarkResult> {
  const mode = playwrightPage ? "with-playwright" : "stagehand-only";
  console.log(`\n[${mode}] Testing: Get Current URL`);

  const page = playwrightPage ?? stagehandPage;
  await page.goto(TEST_URL, { waitUntil: "domcontentloaded" });
  await sleep(500);

  const { successes, failures, timings } = await runBenchmark(async () => {
    const url = page.url();
    if (!url || url.length === 0) {
      throw new Error("Failed to get page URL");
    }
  });

  return {
    operation: "get-url",
    mode,
    runs: RUNS_PER_TEST,
    successes,
    failures,
    successRate: (successes / RUNS_PER_TEST) * 100,
    timings:
      timings.length > 0
        ? calculateStats(timings)
        : { min: 0, max: 0, mean: 0, median: 0 },
  };
}

function printResults(results: BenchmarkResult[]): void {
  console.log("\n" + "=".repeat(80));
  console.log("BENCHMARK RESULTS");
  console.log("=".repeat(80));

  // Group by operation
  const operations = [...new Set(results.map((r) => r.operation))];

  for (const operation of operations) {
    const opResults = results.filter((r) => r.operation === operation);
    console.log(`\n${operation.toUpperCase()}`);
    console.log("-".repeat(80));

    for (const result of opResults) {
      console.log(`\nMode: ${result.mode}`);
      console.log(`  Runs:         ${result.runs}`);
      console.log(`  Successes:    ${result.successes}`);
      console.log(`  Failures:     ${result.failures}`);
      console.log(`  Success Rate: ${result.successRate.toFixed(2)}%`);
      if (result.successes > 0) {
        console.log(`  Timings (ms):`);
        console.log(`    Min:    ${result.timings.min.toFixed(2)}`);
        console.log(`    Max:    ${result.timings.max.toFixed(2)}`);
        console.log(`    Mean:   ${result.timings.mean.toFixed(2)}`);
        console.log(`    Median: ${result.timings.median.toFixed(2)}`);
      }
    }

    // Calculate latency difference if both modes exist
    const stagehandOnly = opResults.find((r) => r.mode === "stagehand-only");
    const withPlaywright = opResults.find((r) => r.mode === "with-playwright");

    if (
      stagehandOnly &&
      withPlaywright &&
      stagehandOnly.successes > 0 &&
      withPlaywright.successes > 0
    ) {
      const meanDiff = withPlaywright.timings.mean - stagehandOnly.timings.mean;
      const percentDiff = (meanDiff / stagehandOnly.timings.mean) * 100;
      console.log(`\nLatency Comparison:`);
      console.log(
        `  Difference: ${meanDiff >= 0 ? "+" : ""}${meanDiff.toFixed(2)}ms (${percentDiff >= 0 ? "+" : ""}${percentDiff.toFixed(2)}%)`,
      );
      if (Math.abs(percentDiff) < 5) {
        console.log(`  Impact: Negligible`);
      } else if (Math.abs(percentDiff) < 15) {
        console.log(`  Impact: Minor`);
      } else {
        console.log(`  Impact: Significant`);
      }
    }
  }

  console.log("\n" + "=".repeat(80));
}

async function main() {
  console.log("Starting Stagehand Benchmark Suite");
  console.log(`Each test will run ${RUNS_PER_TEST} times\n`);

  checkEnvironment();

  const results: BenchmarkResult[] = [];

  // Test Mode 1: Stagehand Only
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 1: Testing with Stagehand Only");
  console.log("=".repeat(80));

  const stagehand1 = new Stagehand({
    env: "LOCAL",
    verbose: 0,
  });

  try {
    await stagehand1.init();
    console.log("✓ Stagehand initialized");
  } catch (error: any) {
    console.error("✗ Failed to initialize Stagehand:", error.message);
    console.error(
      "  Make sure you have set ANTHROPIC_API_KEY or OPENAI_API_KEY",
    );
    process.exit(1);
  }

  // Create initial page for stagehand1
  let stagehand1Page: Page;
  try {
    stagehand1Page = await stagehand1.context.newPage();
    console.log("✓ Initial page created");
  } catch (error: any) {
    console.error("✗ Failed to create page:", error.message);
    await stagehand1.close();
    process.exit(1);
  }

  try {
    results.push(await benchmarkGoto(stagehand1, stagehand1Page));
    results.push(await benchmarkDumpContent(stagehand1, stagehand1Page));
    results.push(await benchmarkNewPage(stagehand1));
    results.push(await benchmarkGetUrl(stagehand1, stagehand1Page));
    results.push(await benchmarkAct(stagehand1, stagehand1Page));
  } catch (error: any) {
    console.error("Error during stagehand-only tests:", error.message);
  } finally {
    await stagehand1.close();
    console.log("\n✓ Stagehand closed");
  }

  // Test Mode 2: With Playwright CDP Connection
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 2: Testing with Playwright CDP Connection");
  console.log("=".repeat(80));

  const stagehand2 = new Stagehand({
    env: "LOCAL",
    verbose: 0,
  });

  try {
    await stagehand2.init();
    console.log("✓ Stagehand initialized");
  } catch (error: any) {
    console.error("✗ Failed to initialize Stagehand:", error.message);
    process.exit(1);
  }

  let browser: Browser | undefined;
  let playwrightPage: Page | undefined;
  let stagehand2Page: Page | undefined;

  try {
    // Create initial page for stagehand2
    stagehand2Page = await stagehand2.context.newPage();
    console.log("✓ Initial page created");

    // Connect Playwright via CDP
    const cdpUrl = stagehand2.connectURL();
    console.log(`Connecting Playwright to CDP: ${cdpUrl}`);
    browser = await chromium.connectOverCDP(cdpUrl);
    console.log("✓ Playwright connected via CDP");

    // Get the default context and page
    const contexts = browser.contexts();
    if (contexts.length > 0) {
      const pages = contexts[0].pages();
      if (pages.length > 0) {
        playwrightPage = pages[0] as unknown as Page;
        console.log("✓ Using existing Playwright page");
      }
    }

    if (!playwrightPage) {
      throw new Error("Could not get Playwright page from CDP connection");
    }

    results.push(
      await benchmarkGoto(stagehand2, stagehand2Page, playwrightPage),
    );
    results.push(
      await benchmarkDumpContent(stagehand2, stagehand2Page, playwrightPage),
    );
    results.push(await benchmarkNewPage(stagehand2, browser));
    results.push(
      await benchmarkGetUrl(stagehand2, stagehand2Page, playwrightPage),
    );
    results.push(
      await benchmarkAct(stagehand2, stagehand2Page, playwrightPage),
    );
  } catch (error: any) {
    console.error("Error during playwright tests:", error.message);
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log("\n✓ Playwright browser closed");
      } catch (_) {
        // Ignore close errors
      }
    }
    await stagehand2.close();
    console.log("✓ Stagehand closed");
  }

  // Print results
  printResults(results);

  console.log("\n✓ Benchmark complete!\n");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
