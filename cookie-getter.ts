#!/usr/bin/env node
import { chromium } from "playwright-core";
import { Command } from "commander";
import { writeFile } from "node:fs/promises";

const program = new Command("cookie-getter")
  .option("-c, --cookies", "File to store cookies to", "cookies.json")
  .action(async (options) => {
    const browser = await chromium.launch({
      headless: false,
    });
    let it = 0;
    while (!browser.isConnected() && it < 300) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      it++;
    }
    if (!browser.isConnected()) {
      console.log("Could not connect...timed out");
      process.exit(1);
    }

    const page = await browser.newPage();

    await new Promise<void>((resolve) => {
      page.on("close", async (_) => {
        const cookies = (await Promise.all(browser.contexts().map(async c => await c.cookies()))).flat();
        const json = JSON.stringify(cookies);
        await writeFile(options.cookies, json);
        console.log(`Cookies written to ${options.cookies}`);
        resolve();
      });
    });
    process.exit(0);
  });

program.parse();
