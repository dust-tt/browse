import { err, ok, Result } from "@browse/common/error";
import { Cookie, ActResult, NetworkEvent, ObserveAction } from "@browse/common/types";
import { Page, Stagehand } from "@browserbasehq/stagehand";

export async function safeStartNetworkRecord(
  page: Page,
  events: NetworkEvent[],
): Promise<Result<void>> {
  try {
    const cdpSession = await (page as any).context().newCDPSession(page);

    (page as any).__cdpSession = cdpSession;

    cdpSession.on("Network.requestWillBeSent", (evt: any) => {
      events.push({
        type: "request",
        requestId: evt.requestId,
        timestamp: Date.now(),
        options: {
          url: evt.request.url,
          method: evt.request.method ?? "GET",
          headers: evt.request.headers ?? {},
          body: evt.request.postData,
        },
      });
    });

    cdpSession.on("Network.responseReceived", (evt: any) => {
      events.push({
        type: "response",
        requestId: evt.requestId,
        timestamp: Date.now(),
        options: {
          url: evt.response.url,
          status: evt.response.status,
          headers: evt.response.headers ?? {},
          body: undefined,
        },
      });
    });

    await cdpSession.send("Network.enable");
    return ok(undefined);
  } catch (e: any) {
    return err(`Failed to start network recording: ${e?.message ?? String(e)}`);
  }
}

export async function safeStopNetworkRecord(
  page: Page,
): Promise<Result<void>> {
  try {
    const cdpSession = (page as any).__cdpSession;
    if (cdpSession) {
      await cdpSession.send("Network.disable");
      await cdpSession.detach();
      delete (page as any).__cdpSession;
    }
    return ok(undefined);
  } catch (e: any) {
    return err(`Failed to stop network recording: ${e?.message ?? String(e)}`);
  }
}

export async function safeGoto(page: Page, url: string): Promise<Result<Page>> {
  try {
    await page.goto(url);
  } catch (e: any) {
    return err(`Failed to navigate to ${url}: ${e?.message ?? String(e)}`);
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
    return err(`Failed to add cookies: ${e?.message ?? String(e)}`);
  }
}

export async function safeContent(page: Page): Promise<Result<string>> {
  try {
    const content = await page.locator("body").innerHtml();
    return ok(content);
  } catch (e: any) {
    return err(`Failed to get page content: ${e?.message ?? String(e)}`);
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
    return err(`Failed to create new page for ${url}: ${e?.message ?? String(e)}`);
  }
}

export async function safeClose(page: Page): Promise<Result<void>> {
  try {
    await page.close();
  } catch (e: any) {
    return err(`Failed to close page: ${e?.message ?? String(e)}`);
  }
  return ok(undefined);
}

export async function safeAct(
  page: Page,
  stagehand: Stagehand,
  instructions: string,
): Promise<Result<ActResult>> {
  try {
    const res = await stagehand.act(instructions, { page });

    if (res.success) {
      return ok({ action: res.actionDescription, url: page.url() });
    }

    // Fallback: use observe to find the element, then act on it directly.
    const observed = await stagehand.observe(instructions, { page });
    if (observed.length > 0) {
      const fallback = await stagehand.act(observed[0], { page });
      if (fallback.success) {
        return ok({ action: fallback.actionDescription, url: page.url() });
      }
    }

    const details = [
      `Failed to interact: ${instructions}`,
      res.message ? `message: ${res.message}` : null,
      res.actionDescription ? `action: ${res.actionDescription}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    return err(details);
  } catch (e: any) {
    const message = e?.message ?? String(e);
    const details = `Failed to interact: ${instructions}\n${message}`;
    return err(details);
  }
}

export async function safeObserve(
  page: Page,
  stagehand: Stagehand,
  instructions: string,
): Promise<Result<ObserveAction[]>> {
  try {
    const res = await stagehand.observe(instructions, { page });
    return ok(
      res.map((a) => ({
        selector: a.selector,
        description: a.description,
        method: a.method,
        arguments: a.arguments,
      })),
    );
  } catch (e: any) {
    const message = e?.message ?? String(e);
    const details = `Failed to observe: ${instructions}\n${message}`;
    return err(details);
  }
}
