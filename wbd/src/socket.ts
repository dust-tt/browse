import net from "net";
import fs from "fs";
import { SESSION_DIR } from "@browse/common/constants";
import path from "path";
import { Session } from "./session";
import { resultToResponse } from "@browse/common/types";
import { BrowserError, prettyString, Result } from "@browse/common/error";

export class ServerSocket {
  private server: net.Server;
  private socketPath: string;
  private result?: Result<unknown, BrowserError>;

  constructor(public sessionName: string = "default") {
    const socketDirPath = path.join(SESSION_DIR, sessionName);
    this.socketPath = path.join(socketDirPath, "sock");
    if (!fs.existsSync(socketDirPath)) {
      fs.mkdirSync(socketDirPath, { recursive: true });
    }
    if (fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }
    this.server = net.createServer((client) => {
      client.on("data", (data) => {
        const req = JSON.parse(data.toString());
        console.log(`Received request:\n${prettyString(req)}`);
        if (!req.method || !req.params) {
          throw new Error(
            `Invalid request: method and params are required, got: ${data.toString()}`,
          );
        }
        this.handleRequest(req.method, req.params, client).catch((e) =>
          console.error(e),
        );
      });
    });
  }

  async handleRequest(
    method: string,
    params: any,
    client: net.Socket,
  ): Promise<void> {
    const result = await Session.call(method, params);
    console.log(`Result:\n${prettyString(result)}`);
    client.write(JSON.stringify(resultToResponse(result)));
  }

  listen() {
    this.server.listen(this.socketPath, () => {
      console.log(
        `Listening on ${this.socketPath} for session ${this.sessionName}`,
      );
    });
    //await new Promise((resolve) => this.server.once("listening", resolve));
  }
}
