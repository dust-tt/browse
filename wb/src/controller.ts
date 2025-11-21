import { BrowserError, err, ok, Result } from "@browse/common/error";
import { ClientSocket } from "./socket";
import {
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
  ): Promise<Result<void, BrowserError>> {
    if (
      !BrowserController.instance ||
      BrowserController.instance.sessionName !== sessionName
    ) {
      const res = await ClientSocket.ensureSession(sessionName);
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

  static listSessions(): { name: string; isRunning: boolean }[] {
    BrowserController.socket.end();
    return fs.readdirSync(SESSION_DIR).map((sessionName) => {
      return {
        name: sessionName,
        isRunning: fs.existsSync(path.join(SESSION_DIR, sessionName, "sock")),
      };
    });
  }

  static async deleteSession() {
    await BrowserController.socket.deleteSession();
  }

  static async send(
    method: SessionMethod,
    params?: unknown,
  ): Promise<Result<unknown, BrowserError>> {
    const res = await BrowserController.instance.socket.send(method, params);
    BrowserController.socket.end();
    return res;
  }

  static async runtimeSeconds(): Promise<Result<number, BrowserError>> {
    const res = await BrowserController.send("runtimeSeconds");
    if (res.isErr()) {
      return res;
    } else if (typeof res.value !== "number") {
      return err(`Got non-number response: ${JSON.stringify(res)}`);
    } else {
      return ok(res.value);
    }
  }

  static async listTabs(): Promise<Result<string[], BrowserError>> {
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

  static async getCurrentTab(): Promise<
    Result<Tab & { tabName: string }, BrowserError>
  > {
    const res = await BrowserController.send("getCurrentTab");
    if (res.isErr()) {
      return res;
    }
    if (!isNamedTab(res.value)) {
      return err(`Got non-tab response: ${JSON.stringify(res)}`);
    }
    return ok(res.value);
  }

  static async setCurrentTab(
    tabName: string,
  ): Promise<Result<void, BrowserError>> {
    const res = await BrowserController.send("setCurrentTab", {
      tabName,
    });
    if (res.isErr()) {
      return res;
    } else {
      return ok(undefined);
    }
  }

  static async newTab(
    tabName: string,
    url: string,
  ): Promise<Result<Tab, BrowserError>> {
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

  static async closeTab(tabName: string): Promise<Result<void, BrowserError>> {
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
  ): Promise<Result<string, BrowserError>> {
    const res = await BrowserController.send("dump", { html, offset });
    if (res.isErr()) {
      return res;
    } else if (typeof res.value !== "string") {
      return err(`Got non-string response: ${JSON.stringify(res)}`);
    } else {
      return ok(res.value);
    }
  }

  static async go(url: string): Promise<Result<void, BrowserError>> {
    const res = await BrowserController.send("go", { url });
    if (res.isErr()) {
      return res;
    } else {
      return ok(undefined);
    }
  }

  static async interact(
    instructions: string,
  ): Promise<Result<InteractResult, BrowserError>> {
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
