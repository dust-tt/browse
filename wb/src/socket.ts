import net from "net";
import fs from "fs";
import { err, ok, Result } from "@browse/common/error";
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
  private pendingResponse: ((response: Result<unknown>) => void) | null = null;
  private result: Result<unknown> | null = null;
  private buffer: string = "";
  private client: net.Socket;

  static async connect(sessionName: string): Promise<Result<ClientSocket>> {
    return new Promise<Result<ClientSocket>>((resolve) => {
      // Even if the net.createConnection is synchronous, it will only connect asynchronously so we
      // need to to wait for the connection to be established
      const socket = new ClientSocket(sessionName);

      // Wait for either 'connect' or 'error' event
      const onConnect = () => {
        socket.client.removeListener("error", onError);
        resolve(ok(socket));
      };

      const onError = (e: Error) => {
        socket.client.removeListener("connect", onConnect);
        resolve(err(e.message));
      };

      socket.client.once("connect", onConnect);
      socket.client.once("error", onError);
    });
  }

  constructor(public sessionName: string) {
    this.client = net.createConnection(socketPath(sessionName));

    // Add error handler immediately to prevent unhandled 'error' events
    this.client.on("error", (e) => {
      // If we have a pending response, resolve it with the error
      if (this.pendingResponse) {
        this.pendingResponse(err(e.message));
        this.pendingResponse = null;
      }
      // Otherwise, the error will be caught during connection attempt
    });

    this.setupListeners();
  }

  static async ensureSession(
    sessionName: string,
    debug: boolean = false,
  ): Promise<Result<void>> {
    if (!fs.existsSync(socketPath(sessionName))) {
      return err(`Session ${sessionName} doesn't exist`);
    } else {
      // Try to connect
      const res = await ClientSocket.connect(sessionName);
      if (res.isOk()) {
        res.value.end(); // Close the test connection
        return ok(undefined);
      } else {
        // Erase stale socket file
        fs.unlinkSync(socketPath(sessionName));
        return ClientSocket.createSession(sessionName, debug);
      }
    }
  }

  static async createSession(
    sessionName: string,
    debug: boolean = false,
  ): Promise<Result<void>> {
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
      const error = child.stderr?.read()?.toString() ?? "unknown error";
      return err(`Session ${sessionName} failed to start: ${error}`);
    }
    return ok(undefined);
  }

  end() {
    this.client.end();
  }

  async deleteSession() {
    if (fs.existsSync(socketPath(this.sessionName))) {
      await this.send("deleteSession");
      fs.unlinkSync(socketPath(this.sessionName));
    }
  }

  async send(method: SessionMethod, params?: any): Promise<Result<unknown>> {
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
      this.pendingResponse = (response: Result<unknown>) => {
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

    this.client.on("close", () => {
      // Handle socket close gracefully
      if (this.pendingResponse) {
        this.pendingResponse(err("Connection closed"));
        this.pendingResponse = null;
      }
    });
  }
}
