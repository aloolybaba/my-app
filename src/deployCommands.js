import { validateConfig } from "./config.js";
import { registerGuildCommands } from "./commands.js";

validateConfig();
await registerGuildCommands();
console.log("Slash commands registered.");
