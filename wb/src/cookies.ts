import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { err, ok, type Result } from "@browse/common/error";
import type { Cookie } from "@browse/common/types";

const CHROME_ROOT = path.join(
  process.env.HOME!,
  "Library/Application Support/Google/Chrome",
);
const KEYLENGTH = 16;
const SALT = "saltysalt";
const ITERATIONS = 1003; // macOS

type ChromeProfile = {
  dirName: string;
  displayName: string;
};

export function discoverProfiles(): Result<ChromeProfile[]> {
  const localStatePath = path.join(CHROME_ROOT, "Local State");
  if (!fs.existsSync(localStatePath)) {
    return err("Chrome Local State not found. Is Chrome installed?");
  }
  const localState = JSON.parse(fs.readFileSync(localStatePath, "utf8"));
  const cache = localState?.profile?.info_cache;
  if (!cache || typeof cache !== "object") {
    return err("No profiles found in Chrome Local State");
  }
  const profiles: ChromeProfile[] = Object.entries(cache).map(
    ([dirName, info]: [string, any]) => ({
      dirName,
      displayName: info.name ?? dirName,
    }),
  );
  if (profiles.length === 0) {
    return err("No Chrome profiles found");
  }
  return ok(profiles);
}

export async function pickProfile(
  profiles: ChromeProfile[],
): Promise<ChromeProfile> {
  if (profiles.length === 1) {
    console.log(`Using profile: ${profiles[0].displayName}`);
    return profiles[0];
  }

  console.log("Available Chrome profiles:");
  for (let i = 0; i < profiles.length; i++) {
    console.log(`  ${i + 1}) ${profiles[i].displayName} (${profiles[i].dirName})`);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("Select profile: ", (answer) => {
      rl.close();
      const idx = parseInt(answer, 10) - 1;
      if (idx >= 0 && idx < profiles.length) {
        resolve(profiles[idx]);
      } else {
        console.error("Invalid selection, using first profile");
        resolve(profiles[0]);
      }
    });
  });
}

function getDerivedKey(): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const keytar = require("keytar");
  return new Promise((resolve, reject) => {
    keytar
      .getPassword("Chrome Safe Storage", "Chrome")
      .then((chromePassword: string) => {
        if (!chromePassword) {
          return reject(new Error("Could not get Chrome Safe Storage password from Keychain"));
        }
        crypto.pbkdf2(
          chromePassword,
          SALT,
          ITERATIONS,
          KEYLENGTH,
          "sha1",
          (err: any, key: Buffer) => {
            if (err) reject(err);
            else resolve(key);
          },
        );
      })
      .catch(reject);
  });
}

function decryptValue(derivedKey: Buffer, encrypted: Buffer): string {
  // Chrome on macOS prefixes encrypted values with "v10" (3 bytes)
  const prefix = encrypted.slice(0, 3).toString("utf8");
  if (prefix !== "v10") {
    // Unknown encryption version, return empty
    return "";
  }

  const iv = Buffer.alloc(KEYLENGTH, " ", "binary");
  const data = encrypted.slice(3);
  const decipher = crypto.createDecipheriv("aes-128-cbc", derivedKey, iv);
  decipher.setAutoPadding(false);

  let decoded = decipher.update(data);
  const final = decipher.final();
  final.copy(decoded, decoded.length - 1);

  // Strip PKCS7 padding, then skip the 32-byte hash prefix (Chromium 24+)
  const padding = decoded[decoded.length - 1];
  if (padding && padding <= KEYLENGTH) {
    decoded = decoded.slice(32, decoded.length - padding);
  }

  return decoded.toString("utf8");
}

function convertChromeTimestamp(chromeTimestamp: number): number {
  // Chrome stores timestamps as microseconds since Jan 1, 1601
  // Convert to Unix epoch seconds
  if (chromeTimestamp === 0) return 0;
  return Math.floor((chromeTimestamp - 11644473600000000) / 1000000);
}

function mapSameSite(value: number): "Strict" | "Lax" | "None" {
  switch (value) {
    case 2:
      return "Strict";
    case 1:
      return "Lax";
    default:
      return "None";
  }
}

function findCookiesDb(profileDir: string): string | null {
  // Chrome stores cookies in different locations depending on version
  const candidates = [
    path.join(CHROME_ROOT, profileDir, "Network", "Cookies"),
    path.join(CHROME_ROOT, profileDir, "Cookies"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function extractCookies(
  profileDir: string,
): Promise<Result<Cookie[]>> {
  const dbPath = findCookiesDb(profileDir);
  if (!dbPath) {
    return err(`Cookies database not found for profile ${profileDir}`);
  }

  let derivedKey: Buffer;
  try {
    derivedKey = await getDerivedKey();
  } catch (e: any) {
    return err(`Failed to get decryption key: ${e.message}`);
  }

  // Copy DB to temp file to avoid locking issues with running Chrome
  const os = require("node:os");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-cookies-"));
  const tmpDb = path.join(tmpDir, "Cookies");
  fs.copyFileSync(dbPath, tmpDb);
  // Also copy WAL/SHM files if they exist
  for (const suffix of ["-wal", "-shm"]) {
    const src = dbPath + suffix;
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, tmpDb + suffix);
    }
  }

  const sqlite3 = require("sqlite3");

  return new Promise((resolve) => {
    const db = new sqlite3.Database(tmpDb, sqlite3.OPEN_READONLY, (err: any) => {
      if (err) {
        cleanup();
        resolve({ isErr: () => true, isOk: () => false, error: { message: `Failed to open cookies DB: ${err.message}` } } as any);
        return;
      }

      const cookies: Cookie[] = [];
      const query = `
        SELECT host_key, path, is_secure, expires_utc, name, value,
               encrypted_value, is_httponly, has_expires, samesite
        FROM cookies
        ORDER BY creation_utc ASC
      `;

      db.each(
        query,
        (rowErr: any, row: any) => {
          if (rowErr) return;

          let value = row.value;
          if (value === "" && row.encrypted_value && row.encrypted_value.length > 0) {
            try {
              value = decryptValue(derivedKey, row.encrypted_value);
            } catch {
              // Skip cookies we can't decrypt
              return;
            }
          }

          if (!value) return;

          cookies.push({
            name: row.name,
            value,
            domain: row.host_key,
            path: row.path,
            expires: row.has_expires
              ? convertChromeTimestamp(row.expires_utc)
              : -1,
            httpOnly: row.is_httponly === 1,
            secure: row.is_secure === 1,
            sameSite: mapSameSite(row.samesite ?? -1),
          });
        },
        () => {
          db.close(() => {
            cleanup();
            resolve(ok(cookies));
          });
        },
      );
    });

    function cleanup() {
      try {
        fs.rmSync(tmpDir, { recursive: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });
}
