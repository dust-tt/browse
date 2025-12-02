#!/usr/bin/env node
import { Command, Option } from "commander";
import { BrowserController } from "./controller";
import { prettyString } from "@browse/common/error";

const program = new Command();


async function init(options: any) {
  const res = await BrowserController.initialize(
    options.session ?? "default",
    options.debug ?? false,
  );
  if (res.isErr()) {
    console.error(res.error);
    process.exit(1);
  }
}

const sessionOpt = new Option("-s, --session [name]","Name of the session to use: default is 'default'");
const dbgOpt = new Option( "-d, --debug","Enable debug mode (makes the browser not headless)");

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
  .description("Create a session")
  .action(async (session, options) => {
    const res = await BrowserController.createSession(session ?? "default", options.debug);
    console.log(res);
    process.exit(0);
  });

sessionCmd
  .command("delete")
  .description("Delete a session")
  .action(async () => {
    const res = await BrowserController.deleteSession();
    console.log(res);
    process.exit(0);
  });

program
  .command("runtime")
  .description("Get the runtime of the current tab")
  .addOption(sessionOpt)
  .addOption(dbgOpt)
  .action(async (options) => {
    await init(options);
    const res = await BrowserController.runtimeSeconds();
    console.log(res);
    process.exit(0);
  });

program
  .command("dump")
  .description("Dump the current tab (max 8196 characters)")
  .addOption(sessionOpt)
  .addOption(dbgOpt)
  .option("-h, --html", "Dump as HTML")
  .option("-o, --offset <offset>", "Offset to start dumping from")
  .action(async (options) => {
    await init(options);
    const res = await BrowserController.dump(options.html, options.offset);
    console.log(res);
    process.exit(0);
  });

program
  .command("go")
  .description("Go to a URL")
  .argument("<url>", "URL to navigate to")
  .addOption(sessionOpt)
  .addOption(dbgOpt)
  .action(async (url, options) => {
    await init(options);
    const res = await BrowserController.go(url);
    console.log(res);
    process.exit(0);
  });

program
  .command("interact")
  .description("Interact with the current tab")
  .argument("<instructions>", "Instructions to interact with")
  .addOption(sessionOpt)
  .addOption(dbgOpt)
  .action(async (instructions, options) => {
    await init(options);
    const res = await BrowserController.interact(instructions);
    console.log(res);
    process.exit(0);
  });

const tabCmd = program.command("tab")
  .description("Manage browser tabs")
  .addOption(sessionOpt)
  .addOption(dbgOpt)
  .hook("preAction", async (cmd) => {
    const options = cmd.options;
    await init(options);
  });

tabCmd
  .command("new")
  .description("Create a new tab")
  .argument("<name>", "Name of the tab")
  .argument("<url>", "URL to navigate to")
  .action(async (name, url) => {
    const res = await BrowserController.newTab(name, url);
    console.log(res);
    process.exit(0);
  });

tabCmd
  .command("close")
  .description("Close a tab")
  .argument("<name>", "Name of the tab")
  .action(async (name) => {
    const res = await BrowserController.closeTab(name);
    console.log(res);
    process.exit(0);
  });

tabCmd
  .command("list")
  .description("List all tabs")
  .action(async () => {
    const res = await BrowserController.listTabs();
    console.log(res);
    process.exit(0);
  });

tabCmd
  .command("current")
  .description("Get the current tab")
  .action(async () => {
    const res = await BrowserController.getCurrentTab();
    console.log(res);
    process.exit(0);
  });

tabCmd
  .command("set-current")
  .description("Set the current tab")
  .argument("<name>", "Name of the tab")
  .action(async (name) => {
    const res = await BrowserController.setCurrentTab(name);
    console.log(res);
    process.exit(0);
  });

program.parse();
