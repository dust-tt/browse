import { InteractResult, isSessionMethod, Tab } from "@browse/common/types";
import { BrowserError, err, ok, Result } from "@browse/common/error";
import {
  isDumpInput,
  isGoInput,
  isInteractInput,
  isNewTabInput,
  isTabInput,
} from "./types";
import { ServerSocket } from "./socket";
import { Page, Stagehand } from "@browserbasehq/stagehand";
import {
  safeClose,
  safeContent,
  safeGoto,
  safeInteract,
  safeNewPage,
} from "./utils";
import { SESSION_DIR } from "@browse/common/constants";
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

  private constructor(public sessionName: string = "default") {
    this.startTime = new Date();
    this.socket = new ServerSocket(sessionName);
    const dataDir = path.join(SESSION_DIR, sessionName, "data");
    fs.mkdirSync(dataDir, { recursive: true });
    this.stagehand = new Stagehand({
      env: "LOCAL",
      localBrowserLaunchOptions: {
        headless: false,
        userDataDir: dataDir,
      },
    });
  }

  static async call(
    method: unknown,
    params: unknown,
  ): Promise<Result<unknown, BrowserError>> {
    if (!isSessionMethod(method)) {
      return err(`Invalid method ${String(method)}`);
    }
    switch (method) {
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

  static runtimeSeconds(): Result<number, BrowserError> {
    return ok(
      (new Date().getTime() - Session.instance.startTime.getTime()) / 1000,
    );
  }

  static async initialize(sessionName: string = "default") {
    if (!Session.instance || Session.instance.sessionName !== sessionName) {
      Session.instance = new Session(sessionName);
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

  static getTab(tabName: string): Result<Tab, BrowserError> {
    return Session.hasTab(tabName)
      ? ok(Session.instance.tabs[tabName])
      : err(`Tab ${tabName} does not exist`);
  }

  static listTabs(): Result<string[], BrowserError> {
    return ok(Object.keys(Session.instance.tabs));
  }

  static getCurrentTab(): Result<{ tabName: string } & Tab, BrowserError> {
    if (!Session.instance.currentTab) {
      return err("No current tab set");
    }
    const tab = Session.getTab(Session.instance.currentTab);
    return tab.isErr()
      ? tab
      : ok({ tabName: Session.instance.currentTab, ...tab.value });
  }

  static setCurrentTab(tabName: string): Result<void, BrowserError> {
    if (Session.hasTab(tabName)) {
      Session.instance.currentTab = tabName;
      return ok(undefined);
    } else {
      return err(`Tab ${tabName} does not exist`);
    }
  }

  static async newTab(
    tabName: string,
    url: string,
  ): Promise<Result<Tab, BrowserError>> {
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

  static async closeTab(tabName: string): Promise<Result<void, BrowserError>> {
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
  ): Promise<Result<string, BrowserError>> {
    if (!Session.instance.currentTab) {
      return err("No current tab set");
    }
    const page = Session.instance.pages[Session.instance.currentTab];
    const res = await safeContent(page);
    if (res.isErr()) {
      return res;
    }
    const text = html ? res.value : convert(res.value);
    return ok(text.slice(offset, 8196 + offset));
  }

  static async go(url: string): Promise<Result<void, BrowserError>> {
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
    return ok(undefined);
  }

  static async interact(
    instructions: string,
  ): Promise<Result<InteractResult, BrowserError>> {
    if (!Session.instance.currentTab) {
      return err("No current tab set");
    }
    const page = Session.instance.pages[Session.instance.currentTab];
    return await safeInteract(page, Session.instance.stagehand, instructions);
  }
}
