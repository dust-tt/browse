import net from "net";
import fs from "fs";
import { SESSION_DIR } from "@browse/common/constants";
import path from "path";
import { Session } from "./session";
import { resultToResponse } from "@browse/common/types";
import { prettyString } from "@browse/common/error";

export class ServerSocket {
  private server: net.Server;
  private socketPath: string;

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
        (async () => {
          const req = JSON.parse(data.toString());
          console.log(`Received request:\n${prettyString(req)}`);
          if (!req.method || !req.params) {
            throw new Error(
              `Invalid request: method and params are required, got: ${data.toString()}`,
            );
          }
          const result = await Session.call(req.method, req.params);
          client.write(JSON.stringify(resultToResponse(result)));
        })();
      });
    });
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
