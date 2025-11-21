import { BrowserError, err, ok, Result } from "@browse/common/error";
import { InteractResult, ObserveResult } from "@browse/common/types";
import { Stagehand } from "@browserbasehq/stagehand";
import { BrowserContext, Locator, Page, chromium } from "playwright-core";

export async function safeContext(
  stagehand: Stagehand,
): Promise<Result<BrowserContext, BrowserError>> {
  try {
    const browser = await chromium.connectOverCDP({
      wsEndpoint: stagehand.connectURL(),
    });
    const context = browser.contexts()[0];
    return ok(context);
  } catch (e: any) {
    return err(e);
  }
}

export async function safeGoto(
  page: Page,
  url: string,
): Promise<Result<Page, BrowserError>> {
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

export async function safeContent(
  page: Page,
): Promise<Result<string, BrowserError>> {
  try {
    const content = await page.locator("body").innerHTML();
    return ok(content);
  } catch (e: any) {
    return err(e);
  }
}

export async function safeNewPage(
  context: BrowserContext,
  url: string,
): Promise<Result<Page, BrowserError>> {
  try {
    const page = await context.newPage();
    const res = await safeGoto(page, url);
    return res;
  } catch (e: any) {
    return err(e);
  }
}

export async function safeClose(
  page: Page,
): Promise<Result<void, BrowserError>> {
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
): Promise<Result<InteractResult, BrowserError>> {
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

export async function safeObserve(
  page: Page,
): Promise<Result<ObserveResult[], BrowserError>> {
  try {
    const locators: Locator[] = [];
    const selectors = [
      "button",
      "a",
      "input",
      "select",
      "textarea",
      '[role="button"]',
      "[onclick]",
    ];
    for (const selector of selectors) {
      locators.push(page.locator(selector));
    }
    return ok(
      (
        await Promise.all(
          locators.map(async (l, i) => {
            const elements = await l.all();
            return await Promise.all(
              elements.map(async (e) => {
                const text = await e.innerText();
                const label =
                  (await e.getAttribute("label")) ??
                  (await e.getAttribute("aria-label")) ??
                  undefined;
                return { selector: selectors[i], content: text, label: label };
              }),
            );
          }),
        )
      )
        .flat()
        .filter((r) => r.content.length > 0 || (r.label && r.label.length > 0)),
    );
  } catch (e: any) {
    return err(e);
  }
}
