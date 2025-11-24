#!/usr/bin/env node
import { Command } from "commander";
import { BrowserController } from "./controller";

const program = new Command();

program
  .option(
    "-s, --session [name]",
    "Name of the session to use: default is 'default'",
    "default",
  )
  .option(
    "-d, --debug",
    "Enable debug mode (makes the browser not headless)",
    false,
  )
  .hook("preAction", async (thisCommand) => {
    const options = thisCommand.opts();
<<<<<<< HEAD
    BrowserController.initialize(options.session, options.debug);
    const res = await ClientSocket.ensureSession(options.session);
=======
    try {
      const res = await BrowserController.initialize(options.session);
>>>>>>> 2a54ae6 (durable)
    if (res.isErr()) {
      console.error(res.error);
      process.exit(1);
    }
    } catch (e: any) {
      console.error("Failed to initialize");
      console.error(e);
    }
  });

program
  .command("sessions")
  .description("List all sessions")
  .action(() => {
    const res = BrowserController.listSessions();
    console.log(res);
    process.exit(0);
  });

program
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
  .action(async () => {
    const res = await BrowserController.runtimeSeconds();
    console.log(res);
    process.exit(0);
  });

program
  .command("dump")
  .description("Dump the current tab (max 8196 characters)")
  .option("-h, --html", "Dump as HTML")
  .option("-o, --offset <offset>", "Offset to start dumping from")
  .action(async (options) => {
    const res = await BrowserController.dump(options.html, options.offset);
    console.log(res);
    process.exit(0);
  });

program
  .command("go")
  .description("Go to a URL")
  .argument("<url>", "URL to navigate to")
  .action(async (url) => {
    const res = await BrowserController.go(url);
    console.log(res);
    process.exit(0);
  });

program
  .command("interact")
  .description("Interact with the current tab")
  .argument("<instructions>", "Instructions to interact with")
  .action(async (instructions) => {
    const res = await BrowserController.interact(instructions);
    console.log(res);
    process.exit(0);
  });

const tabCmd = program.command("tab").description("Manage browser tabs");

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
