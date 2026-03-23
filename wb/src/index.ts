#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { prettyString, type Result } from "@browse/common/error";
import { Command, Option } from "commander";
import { BrowserController } from "./controller";

const program = new Command();

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

function parseFlags(args: string[]): {
  flags: Record<string, string | true>;
  rest: string[];
} {
  const flags: Record<string, string | true> = {};
  const rest: string[] = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith("-")) {
      const key = arg.replace(/^-+/, "");
      if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        flags[key] = args[i + 1];
        i += 2;
      } else {
        flags[key] = true;
        i += 1;
      }
    } else {
      rest.push(arg);
      i += 1;
    }
  }
  return { flags, rest };
}

program
  .command("tab")
  .description("Manage and interact with browser tabs")
  .addOption(sessionOpt)
  .addOption(dbgOpt)
  .allowUnknownOption()
  .allowExcessArguments()
  .argument(
    "<nameOrAction>",
    "Tab name or management action (list, new, close)",
  )
  .argument("[args...]", "Action and arguments")
  .action(async (nameOrAction: string, args: string[], options: any) => {
    // ---- Management commands ----
    if (nameOrAction === "list") {
      await init(options);
      const res = await BrowserController.listTabs();
      const tabs = handleResult(res, false);
      for (const tab of tabs as any[]) {
        console.log(`tab: ${tab.tabName}`);
        console.log(`  ${tab.url}`);
      }
      process.exit(0);
    }

    if (nameOrAction === "new") {
      if (args.length < 2) {
        console.error("Usage: wb tab new <name> <url>");
        process.exit(1);
      }
      await init(options);
      const res = await BrowserController.newTab(args[0], args[1]);
      handleResult(res);
      return;
    }

    if (nameOrAction === "close") {
      if (args.length < 1) {
        console.error("Usage: wb tab close <name>");
        process.exit(1);
      }
      await init(options);
      const res = await BrowserController.closeTab(args[0]);
      handleResult(res);
      return;
    }

    // ---- Tab-specific commands: nameOrAction is the tab name ----
    const tabName = nameOrAction;
    if (args.length < 1) {
      console.error(
        `Usage: wb tab <name> <action>\nActions: go, dump, act, observe, network`,
      );
      process.exit(1);
    }

    const action = args[0];
    const actionArgs = args.slice(1);

    await init(options);

    switch (action) {
      case "go": {
        if (actionArgs.length < 1) {
          console.error("Usage: wb tab <name> go <url>");
          process.exit(1);
        }
        const res = await BrowserController.go(tabName, actionArgs[0]);
        handleResult(res);
        break;
      }

      case "dump": {
        const { flags } = parseFlags(actionArgs);
        const html = "h" in flags || "html" in flags;
        const offset = flags.o ?? flags.offset;
        const res = await BrowserController.dump(
          tabName,
          html,
          offset ? parseInt(String(offset), 10) : 0,
        );
        handleResult(res);
        break;
      }

      case "act": {
        if (actionArgs.length < 1) {
          console.error("Usage: wb tab <name> act <instructions>");
          process.exit(1);
        }
        const res = await BrowserController.act(tabName, actionArgs.join(" "));
        handleResult(res);
        break;
      }

      case "observe": {
        if (actionArgs.length < 1) {
          console.error("Usage: wb tab <name> observe <instructions>");
          process.exit(1);
        }
        const res = await BrowserController.observe(
          tabName,
          actionArgs.join(" "),
        );
        handleResult(res);
        break;
      }

      case "network": {
        if (actionArgs.length < 1) {
          console.error("Usage: wb tab <name> network <start|stop>");
          process.exit(1);
        }
        const subAction = actionArgs[0];
        if (subAction === "start") {
          const res = await BrowserController.startNetworkRecord(tabName);
          handleResult(res);
        } else if (subAction === "stop") {
          const { flags } = parseFlags(actionArgs.slice(1));
          const output = String(flags.o ?? flags.output ?? "network.json");
          const res = await BrowserController.stopNetworkRecord(tabName);
          const content = handleResult(res, false);
          await writeFile(output, JSON.stringify(content, null, 2));
          console.log(`Saved network activity to ${output}`);
          process.exit(0);
        } else {
          console.error("Usage: wb tab <name> network <start|stop>");
          process.exit(1);
        }
        break;
      }

      default:
        console.error(
          `Unknown action: ${action}\nActions: go, dump, act, observe, network`,
        );
        process.exit(1);
    }
  });

program.parse();
