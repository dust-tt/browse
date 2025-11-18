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

export class ClientSocket {
  private clientSocket?: net.Socket;
  private socketPath: string;
  private pendingResponse:
    | ((response: Result<unknown, BrowserError>) => void)
    | null = null;
  private result: Result<unknown, BrowserError> | null = null;
  private get client(): net.Socket {
    try {
      const socket =
        this.clientSocket ??
        net.createConnection(this.socketPath, () => {
          // console.log("Connected to UNIX socket server");
        });
      this.clientSocket = socket;
      return socket;
    } catch (e: any) {
      throw new Error(`Failed to connect to UNIX socket: ${e}`);
    }
  }

  constructor(public sessionName: string) {
    this.socketPath = path.join(SESSION_DIR, sessionName, "sock");
  }

  async connect(): Promise<Result<void, BrowserError>> {
    if (!fs.existsSync(this.socketPath)) {
      console.log(`Starting session ${this.sessionName}`);
      const res = await this.createSession();
      if (res.isErr()) {
        return res;
      }
    }
    const _ = this.client; // Connect to the socket
    this.setupListeners();
    return ok(undefined);
  }

  async createSession(): Promise<Result<void, BrowserError>> {
    // Spawn the browser process in detached mode to orphan it
    const child = spawn("wbd", ["-s", this.sessionName], {
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
    } while (!fs.existsSync(this.socketPath) && elapsed < maxWaitTime);

    if (!fs.existsSync(this.socketPath)) {
      return err(`Session ${this.sessionName} failed to start`);
    }
    return ok(undefined);
  }

  end() {
    this.client.end();
  }

  async deleteSession() {
    await this.send("deleteSession");
    if (fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
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
        method === "deleteSession" ? 100 : 30000,
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

  private setupListeners() {
    this.client.on("data", (data) => {
      if (!this.pendingResponse) {
        return;
      }
      const response = JSON.parse(data.toString());
      if (!isResponse(response)) {
        this.pendingResponse(err(`Invalid response from server: ${response}`));
      }

      this.pendingResponse(responseToResult(response));
      this.pendingResponse = null;
    });
  }
}
