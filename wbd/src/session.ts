import fs from "node:fs";
import path from "node:path";
import { SESSION_DIR } from "@browse/common/constants";
import { err, ok, type Result } from "@browse/common/error";
import {
  type ActResult,
  type Cookie,
  isCookieInput,
  isSessionMethod,
  type NetworkEvent,
  type ObserveAction,
  type Tab,
} from "@browse/common/types";
import { type Page, Stagehand } from "@browserbasehq/stagehand";
import { convert } from "html-to-markdown-node";
import { ServerSocket } from "./socket";
import {
  isActInput,
  isDumpInput,
  isGoInput,
  isNewTabInput,
  isObserveInput,
  isTabInput,
} from "./types";
import {
  safeAct,
  safeAddCookies,
  safeClose,
  safeContent,
  safeGoto,
  safeNewPage,
  safeObserve,
  safeStartNetworkRecord,
  safeStopNetworkRecord,
} from "./utils";

export class Session {
  private static instance: Session;
  private socket: ServerSocket;
  private startTime: Date;
  private tabs: Record<string, Tab> = {};
  private pages: Record<string, Page> = {};
  public currentTab?: string;
  public data: Record<string, any> = {};
  private stagehand: Stagehand;
  private cdpUrl?: string;
  private events: NetworkEvent[] = [];
  private recording: boolean = false;

  private constructor(
    public sessionName: string = "default",
    debug: boolean = false,
    cdpUrl?: string,
  ) {
    this.startTime = new Date();
    this.socket = new ServerSocket(sessionName);
    this.cdpUrl = cdpUrl;
    const dataDir = path.join(SESSION_DIR, sessionName, "data");
    fs.mkdirSync(dataDir, { recursive: true });

    const stagehandOpts: any = {
      env: "LOCAL" as const,
      model: "anthropic/claude-sonnet-4-6",
      verbose: 0,
    };

    if (this.cdpUrl) {
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

  static async call(
    method: unknown,
    params: unknown,
  ): Promise<Result<unknown>> {
    if (!isSessionMethod(method)) {
      return err(`Invalid method ${String(method)}`);
    }
    switch (method) {
      case "startNetworkRecord":
        return Session.startNetworkRecord();
      case "stopNetworkRecord":
        return Session.stopNetworkRecord();
      case "runtimeSeconds":
        return Session.runtimeSeconds();
      case "listTabs":
        return Session.listTabs();
      case "getCurrentTab":
        return Session.getCurrentTab();
      case "setCurrentTab":
        if (isTabInput(params)) {
          return Session.setCurrentTab(params.tabName);
        } else {
          return err("Invalid parameters");
        }
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
          const res = await Session.dump(params.html, params.offset);
          console.log(res);
          return res;
        } else {
          return err("Invalid parameters");
        }
      case "go":
        if (isGoInput(params)) {
          return await Session.go(params.url);
        } else {
          return err("Invalid parameters");
        }
      case "act":
        if (isActInput(params)) {
          return Session.act(params.instructions);
        } else {
          return err("Invalid parameters");
        }
      case "observe":
        if (isObserveInput(params)) {
          return Session.observe(params.instructions);
        } else {
          return err("Invalid parameters");
        }
      case "deleteSession":
        Session.deleteSession();
        return ok(undefined);
    }
  }

  static async startNetworkRecord(): Promise<Result<void>> {
    if (!Session.instance.currentTab) {
      return err("No current tab set");
    }
    const page = Session.instance.pages[Session.instance.currentTab];
    Session.instance.events = [];
    const res = await safeStartNetworkRecord(page, Session.instance.events);
    if (res.isErr()) {
      return res;
    }
    Session.instance.recording = true;
    return ok(undefined);
  }

  static async stopNetworkRecord(): Promise<Result<NetworkEvent[]>> {
    if (!Session.instance.currentTab) {
      return err("No current tab set");
    }
    if (!Session.instance.recording) {
      return err("No active network recording");
    }
    const page = Session.instance.pages[Session.instance.currentTab];
    const res = await safeStopNetworkRecord(page);
    if (res.isErr()) {
      return res;
    }
    Session.instance.recording = false;
    return ok(Session.instance.events);
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

  static listTabs(): Result<
    { tabName: string; url: string; current: boolean }[]
  > {
    return ok(
      Object.entries(Session.instance.tabs).map(([tabName, tab]) => ({
        tabName,
        url: Session.instance.pages[tabName]?.url() ?? tab.url,
        current: tabName === Session.instance.currentTab,
      })),
    );
  }

  static getCurrentTab(): Result<{ tabName: string } & Tab> {
    if (!Session.instance.currentTab) {
      return err("No current tab set");
    }
    const tab = Session.getTab(Session.instance.currentTab);
    return tab.isErr()
      ? tab
      : ok({ tabName: Session.instance.currentTab, ...tab.value });
  }

  static setCurrentTab(tabName: string): Result<void> {
    if (Session.hasTab(tabName)) {
      Session.instance.currentTab = tabName;
      return ok(undefined);
    } else {
      return err(`Tab ${tabName} does not exist`);
    }
  }

  static async addCookies(cookies: Cookie[]): Promise<Result<void>> {
    const res = await safeAddCookies(Session.instance.stagehand, cookies);
    return res;
  }

  static async newTab(tabName: string, url: string): Promise<Result<Tab>> {
    if (Session.hasTab(tabName)) {
      return err(`Tab ${tabName} already exists`);
    } else {
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

      if (Object.keys(Session.instance.tabs).length === 0) {
        Session.instance.currentTab = tabName;
      }

      Session.instance.tabs[tabName] = tab;
      return ok(tab);
    }
  }

  static async closeTab(tabName: string): Promise<Result<void>> {
    if (Session.hasTab(tabName)) {
      delete Session.instance.tabs[tabName];
      const res = await safeClose(Session.instance.pages[tabName]);
      if (res.isErr()) {
        return res;
      }
      delete Session.instance.pages[tabName];
      if (Session.instance.currentTab === tabName) {
        Session.instance.currentTab = undefined;
      }
      return ok(undefined);
    } else {
      return err(`Tab ${tabName} does not exist`);
    }
  }

  static async dump(
    html: boolean,
    offset: number = 0,
  ): Promise<Result<string>> {
    if (!Session.instance.currentTab) {
      return err("No current tab set");
    }
    const page = Session.instance.pages[Session.instance.currentTab];
    const res = await safeContent(page);
    if (res.isErr()) {
      return res;
    }
    Session.instance.tabs[Session.instance.currentTab].actions.push({
      type: "dump",
      timestamp: new Date(),
      options: {
        html,
        offset,
      },
    });
    // Strip SVG elements and data URIs to reduce noise in output.
    const cleaned = res.value.replace(/<svg[\s\S]*?<\/svg>/gi, "");
    let text = html ? cleaned : convert(cleaned);
    if (!html) {
      // Remove any remaining base64 SVG image references in markdown.
      text = text.replace(/!\[[^\]]*\]\(data:image\/svg\+xml[^)]*\)/g, "");
    }
    return ok(text.slice(offset, 8196 + offset));
  }

  static async go(url: string): Promise<Result<void>> {
    if (!Session.instance.currentTab) {
      return err("No current tab set");
    }

    let page = Session.instance.pages[Session.instance.currentTab];
    const pageRes = await safeGoto(page, url);
    if (pageRes.isErr()) {
      return pageRes;
    }
    page = pageRes.value;
    Session.instance.pages[Session.instance.currentTab] = page;
    // we use the page url as there may have been a redirection
    Session.instance.tabs[Session.instance.currentTab].url = page.url();
    Session.instance.tabs[Session.instance.currentTab].actions.push({
      type: "go",
      timestamp: new Date(),
      options: {
        url,
      },
    });
    return ok(undefined);
  }

  static async act(instructions: string): Promise<Result<ActResult>> {
    if (!Session.instance.currentTab) {
      return err("No current tab set");
    }
    const page = Session.instance.pages[Session.instance.currentTab];
    const res = await safeAct(page, Session.instance.stagehand, instructions);
    if (res.isErr()) {
      return res;
    }
    Session.instance.tabs[Session.instance.currentTab].actions.push({
      type: "act",
      timestamp: new Date(),
      options: {
        instructions,
      },
    });
    // The action may have changed the page url (e.g. clicking a link)
    Session.instance.tabs[Session.instance.currentTab].url = page.url();
    return ok(res.value);
  }

  static async observe(instructions: string): Promise<Result<ObserveAction[]>> {
    if (!Session.instance.currentTab) {
      return err("No current tab set");
    }
    const page = Session.instance.pages[Session.instance.currentTab];
    const res = await safeObserve(
      page,
      Session.instance.stagehand,
      instructions,
    );
    if (res.isErr()) {
      return res;
    }
    Session.instance.tabs[Session.instance.currentTab].actions.push({
      type: "observe",
      timestamp: new Date(),
      options: {
        instructions,
      },
    });
    return ok(res.value);
  }
}
