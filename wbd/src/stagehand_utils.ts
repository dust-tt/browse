import { BrowserError, err, ok, Result } from "@browse/common/error";
import { ObserveResult, Page, Stagehand } from "@browserbasehq/stagehand";

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
    const content = await page.content();
    return ok(content);
  } catch (e: any) {
    return err(e);
  }
}

export async function safeNewPage(
  stagehand: Stagehand,
  url: string,
): Promise<Result<Page, BrowserError>> {
  try {
    const page = await stagehand.context.newPage();
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
  instructions: string,
): Promise<Result<void, BrowserError>> {
  try {
    const res = await page.act(instructions);
    if (!res.success) {
      return err(`Failed to interact with ${instructions}`);
    }
  } catch (e: any) {
    return err(e);
  }
  return ok(undefined);
}

export async function safeObserve(
  page: Page,
): Promise<Result<ObserveResult[], BrowserError>> {
  try {
    const results = await page.observe();
    return ok(results);
  } catch (e: any) {
    return err(e);
  }
}
