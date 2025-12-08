import { err, ok, Result } from "@browse/common/error";
import { Cookie, InteractResult, NetworkEvent } from "@browse/common/types";
import { Page, Stagehand, NetworkMessage } from "@anonx3247/stagehand";

export function safeStartNetworkRecord(
  page: Page,
  events: NetworkEvent[],
): Result<[Page, (networkMessage: NetworkMessage) => void]> {
  try {
    const listener = (networkMessage: NetworkMessage) => {
      console.log(networkMessage);
      switch (networkMessage.type()) {
        case "request":
          events.push({
            type: "request",
            requestId: networkMessage.requestId(),
            timestamp: networkMessage.timestamp(),
            options: {
              url: networkMessage.url(),
              method: networkMessage.method() ?? "GET",
              headers: networkMessage.requestHeaders()!,
              body: networkMessage.postData(),
            },
          });
          break;
        case "response":
          events.push({
            type: "response",
            requestId: networkMessage.requestId(),
            timestamp: networkMessage.timestamp(),
            options: {
              url: networkMessage.url(),
              status: networkMessage.status()!,
              headers: networkMessage.responseHeaders()!,
              body: networkMessage.postData(),
            },
          });
          break;
      }
    };
    const pg = page.on("network", listener);
    return ok([pg, listener]);
  } catch (e: any) {
    return err(e);
  }
}

export function safeStopNetworkRecord(
  page: Page,
  listener?: (networkMessage: NetworkMessage) => void,
): Result<Page> {
  try {
    const pg = page.off("network", listener ?? ((_networkMessage) => { }));
    return ok(pg);
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

export async function safeAddCookies(
  stagehand: Stagehand,
  cookies: Cookie[],
): Promise<Result<void>> {
  try {
    const pg =
      stagehand.context.pages().length > 0
        ? stagehand.context.pages()[0]
        : undefined;
    if (!pg) {
      console.log("No page to add cookies to");
      return ok(undefined);
    }
    for (const cookie of cookies) {
      const resp = await pg.sendCDP("Network.setCookie", cookie);
      console.log(resp);
    }
    // let the cookies take effect
    return ok(undefined);
  } catch (e: any) {
    return err(e);
  }
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
