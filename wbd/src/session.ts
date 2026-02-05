import {
  Cookie,
  InteractResult,
  isCookieInput,
  isSessionMethod,
  NetworkEvent,
  Tab,
} from "@browse/common/types";
import { err, ok, Result } from "@browse/common/error";
import {
  isDumpInput,
  isGoInput,
  isInteractInput,
  isNewTabInput,
  isTabInput,
} from "./types";
import { ServerSocket } from "./socket";
import { NetworkMessage, Page, Stagehand } from "@anonx3247/stagehand";
import {
  safeAddCookies,
  safeClose,
  safeContent,
  safeGoto,
  safeInteract,
  safeNewPage,
  safeStartNetworkRecord,
  safeStopNetworkRecord,
} from "./utils";
import { SESSION_DIR } from "@browse/common/constants";
import { Browser, getBrowserFromEnv } from "@browse/common/browser";
import { startLightpanda, stopLightpanda, getLightpandaCdpUrl } from "./lightpanda";
import fs from "fs";
import path from "path";
import { convert } from "html-to-markdown-node";

export class Session {
  private static instance: Session;
  private socket: ServerSocket;
  private startTime: Date;
  private tabs: Record<string, Tab> = {};
  private pages: Record<string, Page> = {};
  public currentTab?: string;
  public data: Record<string, any> = {};
  private stagehand: Stagehand;
  private browser: Browser;
  private events: NetworkEvent[] = [];
  private networkListener?: (networkMessage: NetworkMessage) => void;

  private constructor(
    public sessionName: string = "default",
    debug: boolean = false,
    browser: Browser = "chrome",
  ) {
    this.startTime = new Date();
    this.socket = new ServerSocket(sessionName);
    this.browser = browser;
    const dataDir = path.join(SESSION_DIR, sessionName, "data");
    fs.mkdirSync(dataDir, { recursive: true });

    if (browser === "lightpanda") {
      // Connect to Lightpanda via CDP
      this.stagehand = new Stagehand({
        env: "LOCAL",
        localBrowserLaunchOptions: {
          cdpUrl: getLightpandaCdpUrl(),
          headless: true,
        } as any,
      });
    } else {
      // Launch Chrome
      this.stagehand = new Stagehand({
        env: "LOCAL",
        localBrowserLaunchOptions: {
          headless: !debug,
          userDataDir: dataDir,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
          ],
        },
      });
    }
    console.log(`Session initialized with ${browser} browser`);
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
      case "interact":
        if (isInteractInput(params)) {
          return Session.interact(params.instructions);
        } else {
          return err("Invalid parameters");
        }
      case "deleteSession":
        Session.deleteSession();
        return ok(undefined);
    }
  }

  static startNetworkRecord(): Result<void> {
    if (!Session.instance.currentTab) {
      return err("No current tab set");
    }
    const page = Session.instance.pages[Session.instance.currentTab];
    Session.instance.events = [];
    const res = safeStartNetworkRecord(page, Session.instance.events);
    if (res.isErr()) {
      return res;
    }
    const [pg, listener] = res.value;
    Session.instance.pages[Session.instance.currentTab] = pg;
    Session.instance.networkListener = listener;
    return ok(undefined);
  }

  static stopNetworkRecord(): Result<NetworkEvent[]> {
    if (!Session.instance.currentTab) {
      return err("No current tab set");
    }
    const page = Session.instance.pages[Session.instance.currentTab];
    const res = safeStopNetworkRecord(page, Session.instance.networkListener);
    if (res.isErr()) {
      return res;
    }
    Session.instance.pages[Session.instance.currentTab] = res.value;
    console.log("SIZE:", Session.instance.events.length);
    return ok(Session.instance.events);
  }

  static runtimeSeconds(): Result<number> {
    return ok(
      (new Date().getTime() - Session.instance.startTime.getTime()) / 1000,
    );
  }

  static async initialize(
    sessionName: string = "default",
    debug: boolean = false,
    browser?: Browser,
  ) {
    const effectiveBrowser = browser ?? getBrowserFromEnv();

    if (!Session.instance || Session.instance.sessionName !== sessionName) {
      if (effectiveBrowser === "lightpanda") {
        await startLightpanda();
      }
      Session.instance = new Session(sessionName, debug, effectiveBrowser);
      await Session.instance.stagehand.init();
      Session.instance.socket.listen();
    }
  }

  static deleteSession() {
    if (Session.instance?.browser === "lightpanda") {
      stopLightpanda();
    }
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

  static listTabs(): Result<string[]> {
    return ok(Object.keys(Session.instance.tabs));
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
    const text = html ? res.value : convert(res.value);
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

  static async interact(instructions: string): Promise<Result<InteractResult>> {
    if (!Session.instance.currentTab) {
      return err("No current tab set");
    }
    const page = Session.instance.pages[Session.instance.currentTab];
    const res = await safeInteract(
      page,
      Session.instance.stagehand,
      instructions,
    );
    if (res.isErr()) {
      return res;
    }
    Session.instance.tabs[Session.instance.currentTab].actions.push({
      type: "interact",
      timestamp: new Date(),
      options: {
        instructions,
      },
    });
    // The interaction may have changed the page url (e.g. clicking a link)
    Session.instance.tabs[Session.instance.currentTab].url = page.url();
    return ok(res.value);
  }
}
