import { BrowserError, err, ok, Result } from "@browse/common/error";
import { Page, Stagehand } from "@browserbasehq/stagehand";

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
