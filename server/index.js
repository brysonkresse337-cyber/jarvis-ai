import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

const config = {
  name: "JARVIS",
  owner: { firstName: "Bryson", lastName: "Kresse", title: "Sir", pronunciation: "Kre-ss-ee" }
};

const permissions = {
  safe: ["read_status", "speak", "remember_preference", "calculate", "search_web"],
  approval: ["open_app", "open_url", "read_file", "write_file", "run_command", "take_screenshot"],
  locked: ["delete_file", "install_software", "shutdown", "restart", "send_message", "purchase"]
};

const memory = {
  userName: "Bryson",
  userLastName: "Kresse",
  userTitle: "Sir",
  preferences: { voice: "male butler", theme: "dark futuristic", accent: "red" }
};

const auditLog = [];

function logAction(action, status, details = "") {
  auditLog.push({ timestamp: new Date().toISOString(), action, status, details });
  if (auditLog.length > 500) auditLog.shift();
}

function classifyCommand(message) {
  const text = message.toLowerCase();
  if (text.includes("delete") || text.includes("format")) return { permission: "locked", action: "delete_file" };
  if (text.includes("shutdown") || text.includes("turn off computer")) return { permission: "locked", action: "shutdown" };
  if (text.includes("open ") || text.includes("launch ") || text.includes("run ") || text.includes("execute ")) {
    return { permission: "approval", action: "run_command" };
  }
  return { permission: "safe", action: "chat" };
}

function localResponse(message) {
  const command = classifyCommand(message);
  const text = message.toLowerCase();

  if (command.permission === "locked") {
    logAction(command.action, "blocked", message);
    return { reply: "I cannot execute that operation without the required security authorization, Sir.", permissionRequired: true, permissionLevel: "locked", action: command.action };
  }

  if (command.permission === "approval") {
    logAction(command.action, "approval_required", message);
    return { reply: "That action requires your approval, Sir. I have not executed it.", permissionRequired: true, permissionLevel: "approval", action: command.action };
  }

  if (text.includes("who am i") || text.includes("what is my name")) return { reply: "You are Bryson Kresse, Sir.", permissionRequired: false };
  if (text.includes("status")) return { reply: "All primary JARVIS systems are operational, Sir. Computer control remains permission-gated.", permissionRequired: false };
  if (text.includes("what can you do") || text.includes("capabilities")) return { reply: "I can chat, remember preferences, provide status, use voice interfaces, and prepare permission-gated computer actions. External AI reasoning and the local computer agent are the next modules.", permissionRequired: false };
  if (text.includes("hello") || text.includes("hey")) return { reply: "Good evening, Sir. All primary systems are online. How may I assist you?", permissionRequired: false };

  return { reply: `Understood, Sir. I received your request: "${message}"\n\nThe JARVIS core is online. The external AI reasoning engine can be connected next.`, permissionRequired: false };
}

app.get("/api/health", (_req, res) => res.json({ online: true, assistant: config.name, owner: config.owner.firstName, mode: "permission-first" }));
app.get("/api/config", (_req, res) => res.json(config));
app.get("/api/permissions", (_req, res) => res.json(permissions));
app.get("/api/memory", (_req, res) => res.json(memory));
app.get("/api/audit", (_req, res) => res.json(auditLog));

app.post("/api/memory", (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: "Memory key required." });
  memory.preferences[key] = value;
  logAction("remember_preference", "approved", `${key} = ${value}`);
  res.json({ success: true, memory });
});

app.post("/api/chat", async (req, res) => {
  const message = String(req.body?.message || "").trim();
  if (!message) return res.status(400).json({ error: "Message required." });
  try { res.json(localResponse(message)); }
  catch (error) { console.error(error); res.status(500).json({ error: "JARVIS encountered an internal error." }); }
});

app.use((_req, res) => res.sendFile(path.join(__dirname, "..", "public", "index.html")));

app.listen(PORT, () => console.log(`JARVIS online at http://localhost:${PORT}`));
