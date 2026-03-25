import {
  isCookieInput,
  isSessionMethod,
  type Cookie,
  type ActResult,
  type NetworkEvent,
  type ObserveAction,
  type Tab,
} from "@browse/common/types";
import { err, ok, type Result } from "@browse/common/error";
import {
  isDumpInput,
  isGoInput,
  isActInput,
  isNewTabInput,
  isObserveInput,
  isTabInput,
} from "./types";
import { ServerSocket } from "./socket";
import { Stagehand, type Page } from "@browserbasehq/stagehand";
import {
  safeAddCookies,
  safeClose,
  safeContent,
  safeGoto,
  safeAct,
  safeAgentAct,
  safeNewPage,
  safeObserve,
  safeStartNetworkRecord,
  safeStopNetworkRecord,
} from "./utils";
import { SESSION_DIR } from "@browse/common/constants";
import fs from "node:fs";
import path from "node:path";
import { convert } from "html-to-markdown-node";

export class Session {
  private static instance: Session;
  private socket: ServerSocket;
  private startTime: Date;
  private tabs: Record<string, Tab> = {};
  private pages: Record<string, Page> = {};
  public data: Record<string, any> = {};
  private stagehand: Stagehand;
  private events: Record<string, NetworkEvent[]> = {};
  private recording: Record<string, boolean> = {};

  private constructor(
    public sessionName: string = "default",
    debug: boolean = false,
    cdpUrl?: string,
  ) {
    this.startTime = new Date();
    this.socket = new ServerSocket(sessionName);
    const dataDir = path.join(SESSION_DIR, sessionName, "data");
    fs.mkdirSync(dataDir, { recursive: true });

    const stagehandOpts: any = {
      env: "LOCAL" as const,
      // model: "anthropic/claude-sonnet-4-6",
      verbose: 0,
    };

    if (cdpUrl) {
      stagehandOpts.localBrowserLaunchOptions = {
        cdpUrl,
        headless: !debug,
      };
    } else {
      stagehandOpts.localBrowserLaunchOptions = {
        headless: !debug,
        userDataDir: dataDir,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      };
    }

    this.stagehand = new Stagehand(stagehandOpts);
    console.log(
      `Session initialized${cdpUrl ? ` with CDP URL: ${cdpUrl}` : " with Chrome"}`,
    );
  }

  private static getPage(tabName: string): Result<Page> {
    if (!Session.hasTab(tabName)) {
      return err(`Tab ${tabName} does not exist`);
    }
    return ok(Session.instance.pages[tabName]);
  }

  static async call(
    method: unknown,
    params: unknown,
  ): Promise<Result<unknown>> {
    if (!isSessionMethod(method)) {
      return err(`Invalid method ${String(method)}`);
    }
    switch (method) {
      case "startNetworkRecord":
        if (isTabInput(params)) {
          return Session.startNetworkRecord(params.tabName);
        } else {
          return err("Invalid parameters");
        }
      case "stopNetworkRecord":
        if (isTabInput(params)) {
          return Session.stopNetworkRecord(params.tabName);
        } else {
          return err("Invalid parameters");
        }
      case "runtimeSeconds":
        return Session.runtimeSeconds();
      case "listTabs":
        return Session.listTabs();
      case "addCookies":
        if (isCookieInput(params)) {
          return await Session.addCookies(params.cookies);
        } else {
          return err("Invalid parameters");
        }
      case "newTab":
        if (isNewTabInput(params)) {
          return await Session.newTab(params.tabName, params.url);
        } else {
          return err("Invalid parameters");
        }
      case "closeTab":
        if (isTabInput(params)) {
          return await Session.closeTab(params.tabName);
        } else {
          return err("Invalid parameters");
        }
      case "dump":
        if (isDumpInput(params)) {
          return await Session.dump(params.tabName, params.html, params.offset, params.limit);
        } else {
          return err("Invalid parameters");
        }
      case "go":
        if (isGoInput(params)) {
          return await Session.go(params.tabName, params.url);
        } else {
          return err("Invalid parameters");
        }
      case "act":
        if (isActInput(params)) {
          return Session.act(params.tabName, params.instructions, (params as any).agent);
        } else {
          return err("Invalid parameters");
        }
      case "observe":
        if (isObserveInput(params)) {
          return Session.observe(params.tabName, params.instructions);
        } else {
          return err("Invalid parameters");
        }
      case "deleteSession":
        Session.deleteSession();
        return ok(undefined);
    }
  }

  static async startNetworkRecord(tabName: string): Promise<Result<void>> {
    const pageRes = Session.getPage(tabName);
    if (pageRes.isErr()) return pageRes;
    Session.instance.events[tabName] = [];
    const res = await safeStartNetworkRecord(
      pageRes.value,
      Session.instance.events[tabName],
    );
    if (res.isErr()) return res;
    Session.instance.recording[tabName] = true;
    return ok(undefined);
  }

  static async stopNetworkRecord(
    tabName: string,
  ): Promise<Result<NetworkEvent[]>> {
    const pageRes = Session.getPage(tabName);
    if (pageRes.isErr()) return pageRes;
    if (!Session.instance.recording[tabName]) {
      return err("No active network recording");
    }
    const res = await safeStopNetworkRecord(pageRes.value);
    if (res.isErr()) return res;
    Session.instance.recording[tabName] = false;
    return ok(Session.instance.events[tabName]);
  }

  static runtimeSeconds(): Result<number> {
    return ok((Date.now() - Session.instance.startTime.getTime()) / 1000);
  }

  static async initialize(
    sessionName: string = "default",
    debug: boolean = false,
  ) {
    const cdpUrl = process.env.BROWSE_CDP_URL;

    if (!Session.instance || Session.instance.sessionName !== sessionName) {
      Session.instance = new Session(sessionName, debug, cdpUrl);
      await Session.instance.stagehand.init();
      Session.instance.socket.listen();
    }
  }

  static deleteSession() {
    process.exit(0);
  }

  private static hasTab(tabName: string): boolean {
    return tabName in Session.instance.tabs;
  }

  static getTab(tabName: string): Result<Tab> {
    return Session.hasTab(tabName)
      ? ok(Session.instance.tabs[tabName])
      : err(`Tab ${tabName} does not exist`);
  }

  static listTabs(): Result<{ tabName: string; url: string }[]> {
    return ok(
      Object.entries(Session.instance.tabs).map(([tabName, tab]) => ({
        tabName,
        url: Session.instance.pages[tabName]?.url() ?? tab.url,
      })),
    );
  }

  static async addCookies(cookies: Cookie[]): Promise<Result<void>> {
    const res = await safeAddCookies(Session.instance.stagehand, cookies);
    return res;
  }

  static async newTab(tabName: string, url: string): Promise<Result<Tab>> {
    if (Session.hasTab(tabName)) {
      return err(`Tab ${tabName} already exists`);
    }
    const tab: Tab = {
      url,
      actions: [],
      startTime: new Date(),
    };

    const pageRes = await safeNewPage(Session.instance.stagehand, url);
    if (pageRes.isErr()) {
      return pageRes;
    }
    Session.instance.pages[tabName] = pageRes.value;
    Session.instance.tabs[tabName] = tab;
    return ok(tab);
  }

  static async closeTab(tabName: string): Promise<Result<void>> {
    if (Session.hasTab(tabName)) {
      delete Session.instance.tabs[tabName];
      const res = await safeClose(Session.instance.pages[tabName]);
      if (res.isErr()) {
        return res;
      }
      delete Session.instance.pages[tabName];
      delete Session.instance.events[tabName];
      delete Session.instance.recording[tabName];
      return ok(undefined);
    } else {
      return err(`Tab ${tabName} does not exist`);
    }
  }

  static async dump(
    tabName: string,
    html: boolean,
    offset: number = 0,
    limit: number = 8192,
  ): Promise<Result<string>> {
    const pageRes = Session.getPage(tabName);
    if (pageRes.isErr()) return pageRes;
    const page = pageRes.value;
    const res = await safeContent(page);
    if (res.isErr()) return res;
    Session.instance.tabs[tabName].actions.push({
      type: "dump",
      timestamp: new Date(),
      options: { html, offset, limit },
    });
    // Strip SVG elements and data URIs to reduce noise in output.
    const cleaned = res.value.replace(/<svg[\s\S]*?<\/svg>/gi, "");
    let text = html ? cleaned : convert(cleaned);
    if (!html) {
      // Remove any remaining base64 SVG image references in markdown.
      text = text.replace(/!\[[^\]]*\]\(data:image\/svg\+xml[^)]*\)/g, "");
    }
    const sliced = text.slice(offset, offset + limit);
    const remaining = Math.max(0, text.length - offset - limit);
    const url = page.url();
    const header = `---\nurl: ${url}\noffset: ${offset}\nlimit: ${limit}\nremaining: ${remaining}\n---\n`;
    return ok(header + sliced);
  }

  static async go(tabName: string, url: string): Promise<Result<void>> {
    const pageRes = Session.getPage(tabName);
    if (pageRes.isErr()) return pageRes;
    let page = pageRes.value;
    const gotoRes = await safeGoto(page, url);
    if (gotoRes.isErr()) return gotoRes;
    page = gotoRes.value;
    Session.instance.pages[tabName] = page;
    // we use the page url as there may have been a redirection
    Session.instance.tabs[tabName].url = page.url();
    Session.instance.tabs[tabName].actions.push({
      type: "go",
      timestamp: new Date(),
      options: { url },
    });
    return ok(undefined);
  }

  static async act(
    tabName: string,
    instructions: string,
    agent: boolean = false,
  ): Promise<Result<ActResult>> {
    const pageRes = Session.getPage(tabName);
    if (pageRes.isErr()) return pageRes;
    const page = pageRes.value;
    const res = agent
      ? await safeAgentAct(page, Session.instance.stagehand, instructions)
      : await safeAct(page, Session.instance.stagehand, instructions);
    if (res.isErr()) return res;
    Session.instance.tabs[tabName].actions.push({
      type: "act",
      timestamp: new Date(),
      options: { instructions },
    });
    // The action may have changed the page url (e.g. clicking a link)
    Session.instance.tabs[tabName].url = page.url();
    return ok(res.value);
  }

  static async observe(
    tabName: string,
    instructions: string,
  ): Promise<Result<ObserveAction[]>> {
    const pageRes = Session.getPage(tabName);
    if (pageRes.isErr()) return pageRes;
    const page = pageRes.value;
    const res = await safeObserve(
      page,
      Session.instance.stagehand,
      instructions,
    );
    if (res.isErr()) return res;
    Session.instance.tabs[tabName].actions.push({
      type: "observe",
      timestamp: new Date(),
      options: { instructions },
    });
    return ok(res.value);
  }
}
