import net from "net";
import fs from "fs";
import { SESSION_DIR } from "@browse/common/constants";
import path from "path";
import { Session } from "./session";
import { resultToResponse } from "@browse/common/types";
import { prettyString, Result } from "@browse/common/error";

export class ServerSocket {
  private server: net.Server;
  private socketPath: string;
  private result?: Result<unknown>;
  /** Buffer map to handle chunked TCP data from each client */
  private buffers: Map<net.Socket, string> = new Map();

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
      // Initialize buffer for this client
      this.buffers.set(client, "");

      client.on("data", (data) => {
        this.receiveData(client, data);
      });

      client.on("close", () => {
        // Clean up buffer when client disconnects
        this.buffers.delete(client);
      });

      client.on("error", (err) => {
        console.error("Client socket error:", err);
        this.buffers.delete(client);
      });
    });
  }

  /**
   * Handles incoming data from a client, buffering until a complete JSON message is received.
   * This is necessary because TCP can split large messages across multiple 'data' events.
   */
  private receiveData(client: net.Socket, data: Buffer): void {
    // Append data to the client's buffer
    const currentBuffer = this.buffers.get(client) ?? "";
    this.buffers.set(client, currentBuffer + data.toString());

    // Try to parse complete JSON messages
    const buffer = this.buffers.get(client)!;
    try {
      const req = JSON.parse(buffer);
      console.log(`Received request:\n${prettyString(req)}`);

      if (!req.method || !req.params) {
        throw new Error(
          `Invalid request: method and params are required, got: ${buffer}`,
        );
      }

      // Clear buffer after successful parse
      this.buffers.set(client, "");

      this.handleRequest(req.method, req.params, client).catch((e) =>
        console.error(e),
      );
    } catch (e) {
      // Incomplete JSON, waiting for more data
      // Only log if it's not a SyntaxError (which is expected for incomplete JSON)
      if (!(e instanceof SyntaxError)) {
        console.error("Error processing request:", e);
        this.buffers.set(client, "");
      }
    }
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
