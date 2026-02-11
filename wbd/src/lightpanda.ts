import { ChildProcess, spawn } from "child_process";

const LIGHTPANDA_PORT = 9222;

let lightpandaProcess: ChildProcess | null = null;

export function getLightpandaCdpUrl(): string {
  return `ws://127.0.0.1:${LIGHTPANDA_PORT}`;
}

export async function startLightpanda(): Promise<void> {
  if (lightpandaProcess) return;

  return new Promise((resolve, reject) => {
    lightpandaProcess = spawn(
      "lightpanda",
      ["serve", "--host", "127.0.0.1", "--port", String(LIGHTPANDA_PORT)],
      { stdio: "ignore" },
    );

    lightpandaProcess.on("error", (err) => {
      lightpandaProcess = null;
      reject(new Error(`Failed to start Lightpanda: ${err.message}`));
    });

    lightpandaProcess.on("exit", (code) => {
      if (code !== null && code !== 0) {
        lightpandaProcess = null;
        reject(new Error(`Lightpanda exited with code ${code}`));
      }
    });

    // Give it time to start
    setTimeout(resolve, 1500);
  });
}

export function stopLightpanda(): void {
  lightpandaProcess?.kill();
  lightpandaProcess = null;
}
