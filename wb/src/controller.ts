import { err, ok, Result } from "@browse/common/error";
import { ClientSocket } from "./socket";
import {
  Cookie,
  InteractResult,
  isInteractResult,
  isNamedTab,
  isTab,
  SessionMethod,
  Tab,
} from "@browse/common/types";
import { SESSION_DIR } from "@browse/common/constants";
import fs from "fs";
import path from "path";

export class BrowserController {
  private socket: ClientSocket;
  private static instance: BrowserController;
  private static get socket() {
    return BrowserController.instance.socket;
  }

  private constructor(public sessionName: string = "default") {
    this.socket = new ClientSocket(sessionName);
  }

  static async initialize(
    sessionName: string = "default",
    debug: boolean = false,
  ): Promise<Result<void>> {
    if (
      !BrowserController.instance ||
      BrowserController.instance.sessionName !== sessionName
    ) {
      const res = await ClientSocket.ensureSession(sessionName, debug);
      if (res.isErr()) {
        return res;
      }
      try {
        BrowserController.instance = new BrowserController(sessionName);
      } catch (e: any) {
        return err(e);
      }
    }
    return ok(undefined);
  }

  static async createSession(
    name: string,
    debug?: boolean,
  ): Promise<Result<void>> {
    const res = await ClientSocket.createSession(name, debug);
    if (res.isErr()) {
      return res;
    }
    try {
      BrowserController.instance = new BrowserController(name);
    } catch (e: any) {
      return err(e);
    }
    return ok(undefined);
  }

  static listSessions(): { name: string; isRunning: boolean }[] {
    return fs.readdirSync(SESSION_DIR).map((sessionName) => {
      return {
        name: sessionName,
        isRunning: fs.existsSync(path.join(SESSION_DIR, sessionName, "sock")),
      };
    });
  }

  static async deleteSession(
    sessionName: string = "default",
  ): Promise<Result<void>> {
    const sessionPath = path.join(SESSION_DIR, sessionName);
    if (!fs.existsSync(sessionPath)) {
      // Session already deleted or never created
    } else if (!fs.existsSync(path.join(sessionPath, "sock"))) {
      // Socket file non-existent, just delete data
      fs.rmSync(sessionPath, { recursive: true });
    } else {
      const socketRes = await ClientSocket.connect(sessionName);
      // If you cannot connect, then the socket is stale
      if (socketRes.isOk()) {
        await socketRes.value.deleteSession();
      }
      // Delete all session data & socket file
      fs.rmSync(sessionPath, { recursive: true });
    }
    return ok(undefined);
  }

  static async send(
    method: SessionMethod,
    params?: unknown,
  ): Promise<Result<unknown>> {
    const res = await BrowserController.socket.send(method, params);
    BrowserController.socket.end();
    return res;
  }

  static async runtimeSeconds(): Promise<Result<number>> {
    const res = await BrowserController.send("runtimeSeconds");
    if (res.isErr()) {
      return res;
    } else if (typeof res.value !== "number") {
      return err(`Got non-number response: ${JSON.stringify(res)}`);
    } else {
      return ok(res.value);
    }
  }

  static async listTabs(): Promise<Result<string[]>> {
    const res = await BrowserController.send("listTabs");
    if (res.isErr()) {
      return res;
    } else if (
      !Array.isArray(res.value) ||
      res.value.some((v) => typeof v !== "string")
    ) {
      return err(`Got non-array response: ${JSON.stringify(res)}`);
    } else {
      return ok(res.value);
    }
  }

  static async getCurrentTab(): Promise<Result<Tab & { tabName: string }>> {
    const res = await BrowserController.send("getCurrentTab");
    if (res.isErr()) {
      return res;
    }
    if (!isNamedTab(res.value)) {
      return err(`Got non-tab response: ${JSON.stringify(res)}`);
    }
    return ok(res.value);
  }

  static async setCurrentTab(tabName: string): Promise<Result<void>> {
    const res = await BrowserController.send("setCurrentTab", {
      tabName,
    });
    if (res.isErr()) {
      return res;
    } else {
      return ok(undefined);
    }
  }

  static async addCookies(cookies: Cookie[]): Promise<Result<void>> {
    const res = await BrowserController.send("addCookies", { cookies });
    if (res.isErr()) {
      return res;
    } else {
      return ok(undefined);
    }
  }

  static async newTab(tabName: string, url: string): Promise<Result<Tab>> {
    const res = await BrowserController.send("newTab", {
      tabName,
      url,
    });
    if (res.isErr()) {
      return res;
    } else if (!isTab(res.value)) {
      return err(`Got non-tab response: ${JSON.stringify(res)}`);
    } else {
      return ok(res.value);
    }
  }

  static async closeTab(tabName: string): Promise<Result<void>> {
    const res = await BrowserController.send("closeTab", {
      tabName,
    });
    if (res.isErr()) {
      return res;
    } else {
      return ok(undefined);
    }
  }

  static async dump(
    html: boolean = false,
    offset: number = 0,
  ): Promise<Result<string>> {
    const res = await BrowserController.send("dump", { html, offset });
    if (res.isErr()) {
      return res;
    } else if (typeof res.value !== "string") {
      return err(`Got non-string response: ${JSON.stringify(res)}`);
    } else {
      return ok(res.value);
    }
  }

  static async go(url: string): Promise<Result<void>> {
    const res = await BrowserController.send("go", { url });
    if (res.isErr()) {
      return res;
    } else {
      return ok(undefined);
    }
  }

  static async interact(instructions: string): Promise<Result<InteractResult>> {
    const res = await BrowserController.send("interact", {
      instructions,
    });
    if (res.isErr()) {
      return res;
    } else if (!isInteractResult(res.value)) {
      return err(`Got non-interact response: ${JSON.stringify(res)}`);
    } else {
      return ok(res.value);
    }
  }
}
