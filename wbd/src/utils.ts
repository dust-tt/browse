import { err, ok, Result } from "@browse/common/error";
import { InteractResult } from "@browse/common/types";
import { Stagehand } from "@browserbasehq/stagehand";
import { Browser, Page, chromium } from "playwright";

export async function safeBrowser(
  stagehand: Stagehand,
): Promise<Result<Browser>> {
  try {
    const browser = await chromium.connectOverCDP(stagehand.connectURL());
    return ok(browser);
  } catch (e: any) {
    return err(e);
  }
}

export async function safeGoto(page: Page, url: string): Promise<Result<Page>> {
  try {
    const res = await page.goto(url);
    if (!res || !res.ok()) {
      return err(`Failed to navigate to ${url}`);
    }
  } catch (e: any) {
    return err(e);
  }
  return ok(page);
}

export async function safeContent(page: Page): Promise<Result<string>> {
  try {
    const content = await page.locator("body").innerHTML();
    return ok(content);
  } catch (e: any) {
    return err(e);
  }
}

export async function safeNewPage(
  browser: Browser,
  url: string,
): Promise<Result<Page>> {
  try {
    const page = await browser.newPage();
    const res = await safeGoto(page, url);
    return res;
  } catch (e: any) {
    return err(e);
  }
}

export async function safeClose(page: Page): Promise<Result<void>> {
  try {
    await page.close();
  } catch (e: any) {
    return err(e);
  }
  return ok(undefined);
}

export async function safeInteract(
  page: Page,
  stagehand: Stagehand,
  instructions: string,
): Promise<Result<InteractResult>> {
  try {
    const res = await stagehand.act(instructions, { page });

    if (!res.success) {
      return err(`Failed to interact with ${instructions}`);
    }
    return ok({ description: res.actionDescription, url: page.url() });
  } catch (e: any) {
    return err(e);
  }
}
