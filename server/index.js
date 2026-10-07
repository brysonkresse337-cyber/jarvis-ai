import express from "express";
import dotenv from "dotenv";
import path from "node:path";\nimport fs from "node:fs";
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


const PROFILE_FILE=path.join(__dirname,"..","data","bryson.json");
const MEMORY_FILE=path.join(__dirname,"..","data","memory.json");
fs.mkdirSync(path.dirname(PROFILE_FILE),{recursive:true});

let profile={};
let memory={facts:[],preferences:{voice:"male butler",theme:"dark futuristic",accent:"red"},conversation:[]};

function loadJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,"utf8"))}catch{return fallback}}
function saveJson(file,value){fs.writeFileSync(file,JSON.stringify(value,null,2))}
function loadProfile(){profile=loadJson(PROFILE_FILE,{});return profile}
function flatten(value,prefix="",out=[]){
 if(value===null||value===undefined)return out;
 if(typeof value==="object"){for(const [k,v] of Object.entries(value))flatten(v,prefix?prefix+"."+k:k,out)}
 else out.push({path:prefix,value:String(value)});
 return out;
}
function profileSearch(query){
 const terms=query.toLowerCase().replace(/[^a-z0-9' -]/g," ").split(/\s+/).filter(x=>x.length>2);
 return flatten(profile).map(r=>({...r,score:terms.reduce((n,t)=>n+((r.path+" "+r.value).toLowerCase().includes(t)?1:0),0)})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score).slice(0,10);
}
function remember(text){
 memory.facts.push({text,createdAt:new Date().toISOString()});
 memory.facts=memory.facts.slice(-200);
 saveJson(MEMORY_FILE,memory);
}
loadProfile();
memory=loadJson(MEMORY_FILE,memory);
\nconst auditLog = [];

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
  if (text.includes("what do you know about me") || text.includes("tell me everything about me")) {
    const p=profile.identity||{};
    const a=profile.athletics||{};
    const b=profile.business||{};
    return { reply:`You are ${p.fullName||"Bryson Kresse"}, age ${p.age||15}, Sir. Your primary sport is track and field, with high jump as your main event. Your current high jump is ${a.currentHighJump||"6'0\""} and your current squat is ${a.currentSquat||"315 lb"}. Your main business is ${b.brands?.[0]||"BK Media"}, focused on sports media and photography. Your complete personal profile is loaded into my local knowledge core.`, permissionRequired:false };
  }
  if (text.includes("about me") || text.includes("what are my") || text.includes("my profile")) {
    const hits=profileSearch(message);
    if(hits.length) return { reply:"From your personal profile, Sir:\\n"+hits.map(h=>"• "+h.path+": "+h.value).join("\\n"), permissionRequired:false };
  }
  if (text.startsWith("remember ") || text.startsWith("don't forget ")) {
    const fact=message.replace(/^(remember|don't forget)\\s+/i,"").trim();
    if(fact){remember(fact);return {reply:"Understood, Sir. I've stored that in local memory.",permissionRequired:false};}
  }
  if (text.includes("do you remember")) {
    return {reply:memory.facts.length ? "Yes, Sir. Recent memories:\\n"+memory.facts.slice(-8).map(x=>"• "+x.text).join("\\n") : "I don't have saved local memories yet, Sir.",permissionRequired:false};
  }
  if (text.includes("status")) return { reply: "All primary JARVIS systems are operational, Sir. Computer control remains permission-gated.", permissionRequired: false };
  if (text.includes("what can you do") || text.includes("capabilities")) return { reply: "I can chat, remember preferences, provide status, use voice interfaces, and prepare permission-gated computer actions. External AI reasoning and the local computer agent are the next modules.", permissionRequired: false };
  if (text.includes("hello") || text.includes("hey")) return { reply: "Good evening, Sir. All primary systems are online. How may I assist you?", permissionRequired: false };

  return { reply: `Understood, Sir. I received your request: "${message}"\n\nThe JARVIS core is online. The external AI reasoning engine can be connected next.`, permissionRequired: false };
}

app.get("/api/health", (_req, res) => res.json({ online:true, assistant:config.name, owner:config.owner.firstName, mode:"offline-local", profileLoaded:Object.keys(profile).length>0, externalAPI:false }));
app.get("/api/config", (_req, res) => res.json(config));
app.get("/api/permissions", (_req, res) => res.json(permissions));
app.get("/api/memory", (_req, res) => res.json(memory));\napp.get("/api/profile", (_req,res)=>res.json(profile));
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
