#!/usr/bin/env node
import { Command } from "commander";
import { Session } from "./session";

const program = new Command();
console.log("wbd daemon");

program
  .option("-s, --session-name [name]", "Session name", "default")
  .option("-d, --debug", "Enable debug mode", false)
  .action((options) => {
    console.log(`Starting daemon for session ${options.sessionName}`);
    Session.initialize(options.sessionName, options.debug);
  });

program.parse();
