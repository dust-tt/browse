import { err, ok, Result } from "@browse/common/error";
import { InteractResult } from "@browse/common/types";
import { Page, Stagehand } from "@browserbasehq/stagehand";

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
    const content = await page.locator("body").innerHtml();
    return ok(content);
  } catch (e: any) {
    return err(e);
  }
}

export async function safeNewPage(
  stagehand: Stagehand,
  url: string,
): Promise<Result<Page>> {
  try {
    const page = await stagehand.context.newPage();
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
