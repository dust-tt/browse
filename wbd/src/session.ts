import { isSessionMethod, Tab } from "@browse/common/types";
import { BrowserError, err, ok, Result } from "@browse/common/error";
import {
  isDumpInput,
  isGoInput,
  isInteractInput,
  isNewTabInput,
  isTabInput,
} from "./types";
import { ServerSocket } from "./socket";

export class Session {
  private static instance: Session;
  private socket: ServerSocket;
  private startTime: Date;
  private tabs: Record<string, Tab> = {};
  public currentTab?: string;
  public data: Record<string, any> = {};

  private constructor(public sessionName: string = "default") {
    this.startTime = new Date();
    this.socket = new ServerSocket(sessionName);
  }

  static async call(
    method: unknown,
    params: unknown,
  ): Promise<Result<any, BrowserError>> {
    if (!isSessionMethod(method)) {
      return err(`Invalid method ${String(method)}`);
    }
    switch (method) {
      case "runtimeSeconds":
        return Session.runtimeSeconds();
      case "getTab":
        if (isTabInput(params)) {
          return Session.getTab(params.tabName);
        } else {
          return err("Invalid parameters");
        }
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
          return Session.newTab(params.tabName, params.url);
        } else {
          return err("Invalid parameters");
        }
      case "closeTab":
        if (isTabInput(params)) {
          return Session.closeTab(params.tabName);
        } else {
          return err("Invalid parameters");
        }
      case "dump":
        if (isDumpInput(params)) {
          return Session.dump(params.html);
        } else {
          return err("Invalid parameters");
        }
      case "go":
        if (isGoInput(params)) {
          return Session.go(params.url);
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

  static initialize(sessionName: string = "default") {
    if (!Session.instance || Session.instance.sessionName !== sessionName) {
      Session.instance = new Session(sessionName);
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

  static newTab(tabName: string, url: string): Result<Tab, BrowserError> {
    if (Session.hasTab(tabName)) {
      return err(`Tab ${tabName} already exists`);
    } else {
      const tab: Tab = {
        url,
        actions: [],
        startTime: new Date(),
      };
      if (Object.keys(Session.instance.tabs).length === 0) {
        Session.instance.currentTab = tabName;
      }
      Session.instance.tabs[tabName] = tab;
      return ok(tab);
    }
  }

  static closeTab(tabName: string): Result<void, BrowserError> {
    if (Session.hasTab(tabName)) {
      delete Session.instance.tabs[tabName];
      if (Session.instance.currentTab === tabName) {
        Session.instance.currentTab = undefined;
      }
      return ok(undefined);
    } else {
      return err(`Tab ${tabName} does not exist`);
    }
  }

  static async dump(html: boolean): Promise<Result<string, BrowserError>> {
    console.log(`Dumping HTML:${html}`);
    return ok("");
  }
  static async go(url: string): Promise<Result<void, BrowserError>> {
    console.log(`Navigating to ${url}`);
    return ok(undefined);
  }
  static async interact(
    instructions: string,
  ): Promise<Result<void, BrowserError>> {
    console.log(`Interacting with ${instructions}`);
    return ok(undefined);
  }
}
