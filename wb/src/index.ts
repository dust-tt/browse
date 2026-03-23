#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { prettyString, type Result } from "@browse/common/error";
import { Command, Option } from "commander";
import { BrowserController } from "./controller";

const program = new Command();
program.showHelpAfterError();

function handleResult<T>(res: Result<T>, exitOnValue = true): T {
  if (res.isErr()) {
    console.error(res.error);
    process.exit(1);
  } else {
    if (exitOnValue) {
      console.log(prettyString(res.value));
      process.exit(0);
    }
    return res.value;
  }
}

async function init(options: any) {
  const res = await BrowserController.initialize(
    options.session ?? "default",
    options.debug ?? false,
  );
  handleResult(res, false);
}

const sessionOpt = new Option(
  "-s, --session [name]",
  "Name of the session to use: default is 'default'",
);
const dbgOpt = new Option(
  "-d, --debug",
  "Enable debug mode (makes the browser not headless)",
);

// ===============
// SESSION
// ===============

const sessionCmd = program.command("session");

sessionCmd
  .command("list")
  .description("List all sessions")
  .action(() => {
    const res = BrowserController.listSessions();
    console.log(prettyString(res));
    process.exit(0);
  });

sessionCmd
  .command("create [session]")
  .addOption(dbgOpt)
  .option("-c, --cookies <file>", "cookies json file")
  .description("Create a session")
  .action(async (session, options) => {
    let res = await BrowserController.createSession(
      session ?? "default",
      options.debug,
    );
    handleResult(res, !options.cookies);
    if (options.cookies) {
      const content = (await readFile(options.cookies)).toString();
      const cookies = JSON.parse(content);
      if (!Array.isArray(cookies)) {
        console.log("Invalid cookies file");
        process.exit(1);
      }
      res = await BrowserController.addCookies(cookies);
      handleResult(res);
    }
  });

sessionCmd
  .command("delete [session]")
  .description("Delete a session")
  .action(async (session) => {
    const res = await BrowserController.deleteSession(session);
    handleResult(res);
  });

// ===============
// RUNTIME
// ===============

program
  .command("runtime")
  .description("Get the runtime of the current session")
  .addOption(sessionOpt)
  .addOption(dbgOpt)
  .action(async (options) => {
    await init(options);
    const res = await BrowserController.runtimeSeconds();
    handleResult(res);
  });

// ===============
// TAB
// ===============

const tabCmd = program
  .command("tab")
  .description("Manage and interact with browser tabs")
  .addOption(sessionOpt)
  .addOption(dbgOpt)
  .hook("preAction", async (cmd) => {
    await init(cmd.opts());
  });

tabCmd
  .command("list")
  .description("List all tabs")
  .action(async () => {
    const res = await BrowserController.listTabs();
    const tabs = handleResult(res, false);
    for (const tab of tabs as any[]) {
      console.log(`tab: ${tab.tabName}`);
      console.log(`  ${tab.url}`);
    }
    process.exit(0);
  });

tabCmd
  .command("new")
  .description("Create a new tab and navigate to a URL")
  .argument("<name>", "Name of the tab")
  .argument("<url>", "URL to navigate to")
  .action(async (name, url) => {
    const res = await BrowserController.newTab(name, url);
    handleResult(res);
  });

tabCmd
  .command("close")
  .description("Close a tab")
  .argument("<name>", "Name of the tab")
  .action(async (name) => {
    const res = await BrowserController.closeTab(name);
    handleResult(res);
  });

tabCmd
  .command("go")
  .description("Navigate a tab to a URL")
  .argument("<name>", "Name of the tab")
  .argument("<url>", "URL to navigate to")
  .action(async (name, url) => {
    const res = await BrowserController.go(name, url);
    handleResult(res);
  });

tabCmd
  .command("dump")
  .description("Dump tab content")
  .argument("<name>", "Name of the tab")
  .option("-h, --html", "Dump as HTML")
  .option("-o, --offset <offset>", "Offset to start dumping from", parseInt)
  .option("-l, --limit <limit>", "Max characters to return", parseInt)
  .action(async (name, options) => {
    const limit = options.limit ?? 8192;
    const offset = options.offset ?? 0;
    const res = await BrowserController.dump(name, options.html, offset, limit);
    handleResult(res);
  });

tabCmd
  .command("act")
  .description("Perform an action on a tab")
  .argument("<name>", "Name of the tab")
  .argument("<instructions>", "Instructions for the action to perform")
  .action(async (name, instructions) => {
    const res = await BrowserController.act(name, instructions);
    handleResult(res);
  });

tabCmd
  .command("observe")
  .description("Observe available actions on a tab")
  .argument("<name>", "Name of the tab")
  .argument("<instructions>", "Instructions describing what to observe")
  .action(async (name, instructions) => {
    const res = await BrowserController.observe(name, instructions);
    handleResult(res);
  });

const networkCmd = tabCmd
  .command("network")
  .description("Record network events on a tab");

networkCmd
  .command("start")
  .description("Start recording network events")
  .argument("<name>", "Name of the tab")
  .action(async (name) => {
    const res = await BrowserController.startNetworkRecord(name);
    handleResult(res);
  });

networkCmd
  .command("stop")
  .description("Stop recording and save network events")
  .argument("<name>", "Name of the tab")
  .option("-o, --output <file>", "Output file", "network.json")
  .action(async (name, options) => {
    const res = await BrowserController.stopNetworkRecord(name);
    const content = handleResult(res, false);
    await writeFile(options.output, JSON.stringify(content, null, 2));
    console.log(`Saved network activity to ${options.output}`);
    process.exit(0);
  });

program.parse();
