import net from "net";
import fs from "fs";
import { BrowserError, err, ok, Result } from "@browse/common/error";
import { SESSION_DIR } from "@browse/common/constants";
import path from "path";
import { spawn } from "child_process";
import {
  isResponse,
  responseToResult,
  SessionMethod,
} from "@browse/common/types";

function socketPath(sessionName: string): string {
  return path.join(SESSION_DIR, sessionName, "sock");
}

export class ClientSocket {
  private pendingResponse:
    | ((response: Result<unknown, BrowserError>) => void)
    | null = null;
  private result: Result<unknown, BrowserError> | null = null;
  private buffer: string = "";
  private client: net.Socket;

  constructor(public sessionName: string) {
    try {
      this.client = net.createConnection(socketPath(sessionName));
      this.setupListeners();
    } catch (e: any) {
      throw new Error(`Failed to connect to UNIX socket: ${e}`);
    }
  }

  static async ensureSession(
    sessionName: string,
    debug: boolean = false,
  ): Promise<Result<void, BrowserError>> {
    return !fs.existsSync(socketPath(sessionName))
      ? await ClientSocket.createSession(sessionName, debug)
      : ok(undefined);
  }

  static async createSession(
    sessionName: string,
    debug: boolean = false,
  ): Promise<Result<void, BrowserError>> {
    // Spawn the browser process in detached mode to orphan it
    const options = (debug ? ["-d"] : []).concat(["-s", sessionName]);
    const child = spawn("wbd", options, {
      detached: true,
      stdio: "ignore",
    });

    // Unref the child process so the parent can exit independently
    child.unref();

    // Wait for the socket file to be created
    const maxWaitTime = 10_000;
    const checkInterval = 100;
    let elapsed = 0;

    do {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      elapsed += checkInterval;
    } while (!fs.existsSync(socketPath(sessionName)) && elapsed < maxWaitTime);

    if (!fs.existsSync(socketPath(sessionName))) {
      return err(`Session ${sessionName} failed to start`);
    }
    return ok(undefined);
  }

  end() {
    this.client.end();
  }

  async deleteSession() {
    await this.send("deleteSession");
    if (fs.existsSync(socketPath(this.sessionName))) {
      fs.unlinkSync(socketPath(this.sessionName));
    }
  }

  async send(
    method: SessionMethod,
    params?: any,
  ): Promise<Result<unknown, BrowserError>> {
    const response = new Promise((resolve, reject) => {
      this.pendingResponse = resolve;

      this.client.write(
        JSON.stringify({ method, params: params ?? {} }),
        (err) => {
          if (err) {
            this.pendingResponse = null;
            reject(err);
          }
        },
      );

      // Add timeout to prevent hanging indefinitely
      const timeout = setTimeout(
        () => {
          if (this.pendingResponse) {
            this.pendingResponse = null;
            reject(new Error("Request timeout"));
          }
        },
        method === "deleteSession" ? 100 : 60000,
      ); // 30 second timeout (only need to wait for a bit for deleteSession)

      // Clear timeout when response is received
      const originalResolve = resolve;
      this.pendingResponse = (response: Result<unknown, BrowserError>) => {
        clearTimeout(timeout);
        this.result = response;
        originalResolve(response);
      };
    });

    try {
      await response;
      if (!this.result) {
        return err(`Got empty result`);
      }
      const res = this.result;
      this.result = null;
      return res;
    } catch (e: any) {
      return err(e);
    }
  }

  private recieveData(data: Buffer<ArrayBuffer>): void {
    if (!this.pendingResponse) {
      return;
    }
    this.buffer += data.toString();

    try {
      const response = JSON.parse(this.buffer);
      if (!isResponse(response)) {
        this.pendingResponse(err(`Invalid response from server: ${response}`));
      }

      this.pendingResponse(responseToResult(response));
      this.pendingResponse = null;
      this.buffer = "";
    } catch (_) {
      // Incomplete JSON, waiting for more data
    }
  }

  private setupListeners() {
    this.client.on("data", (d) => this.recieveData(d));
  }
}
