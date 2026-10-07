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

function tokenize(text){return String(text).toLowerCase().replace(/[^a-z0-9' ]/g," ").split(/\\s+/).filter(Boolean)}
function rememberConversation(role,text){memory.conversation.push({role,text:String(text),createdAt:new Date().toISOString()});memory.conversation=memory.conversation.slice(-100);saveJson(MEMORY_FILE,memory)}
function smartProfileAnswer(message){
  const hits=profileSearch(message);
  if(!hits.length)return null;
  const grouped=new Map();
  for(const h of hits){const root=h.path.split(".")[0];if(!grouped.has(root))grouped.set(root,[]);if(grouped.get(root).length<4)grouped.get(root).push(h)}
  return [...grouped.entries()].slice(0,5).map(([k,items])=>items.map(x=>`${k}: ${x.value}`).join("\\n")).join("\\n");
}
function calculateExpression(message){
  const m=message.match(/(?:calculate|what is|compute)\\s+([0-9+\\-*/().%\\s]+)$/i);if(!m)return null;
  const expr=m[1].trim();if(!/^[0-9+\\-*/().%\\s]+$/.test(expr))return null;
  try{const result=Function(`"use strict";return (${expr})`)();if(Number.isFinite(result))return result}catch{}return null;
}
function localResponse(message){
  const command=classifyCommand(message), text=message.toLowerCase().trim();
  if(command.permission==="locked"){logAction(command.action,"blocked",message);return {reply:"I cannot execute that operation without the required security authorization, Sir.",permissionRequired:true,permissionLevel:"locked",action:command.action}}
  if(command.permission==="approval"){logAction(command.action,"approval_required",message);return {reply:"That action requires your approval, Sir. I have not executed it.",permissionRequired:true,permissionLevel:"approval",action:command.action}}
  if(text.includes("who am i")||text.includes("what is my name"))return {reply:"You are Bryson Kresse, Sir. Your surname is pronounced Kre-ss-ee.",permissionRequired:false};
  if(/^(what do i do|what do you do i do|what is my job|what do i do for work|what do i do for a living)\\??$/.test(text)){
    const b=profile.business||{}, a=profile.athletics||{};
    return {reply:`You have two major lanes, Sir. First, you're a track-and-field athlete, with high jump as your primary event; you're currently at ${a.currentHighJump||"6'0\""} and squat ${a.currentSquat||"315 lb"}. Second, you run ${(b.brands||["BK Media"])[0]} and are building it into a professional sports-media company. You do sports photography, videography, media production and event coverage, with experience covering NBA G League, college football, high school football and track. You're also building JARVIS as your personal AI system.`,permissionRequired:false};
  }
  if(/^(what are my businesses|what businesses do i have|what companies do i have|tell me about my business|what is my business|what do i do in business)\\??$/.test(text)){
    const b=profile.business||{};
    return {reply:`Your main business is ${(b.brands||["BK Media"])[0]}, with the related names ${(b.brands||[]).slice(1).join(", ")}. Your focus is professional sports photography, videography, media production, event coverage and sports content. Your goal is to turn BK Media into a legitimate professional sports-media company.`,permissionRequired:false};
  }
  if(/^(what sport do i play|what sports do i do|what are my sports|what is my main sport)\\??$/.test(text)){
    const a=profile.athletics||{};
    return {reply:`You compete in track and field, Sir. High jump is your primary event, and you also do the 100m, long jump and discus. Your current high jump is ${a.currentHighJump||"6'0\""} and your current squat is ${a.currentSquat||"315 lb"}.`,permissionRequired:false};
  }
  if(/^(what am i working on|what projects am i working on|what am i building|what projects do i have)\\??$/.test(text)){
    return {reply:"You're working on several major projects, Sir: building BK Media into a professional sports-media company, developing your athletics and recruiting profile, building this JARVIS personal AI system, creating professional websites and digital products, and turning your existing media skills into income.",permissionRequired:false};
  }
  if(/^(what are my goals|what are my main goals|what are my priorities|what am i trying to accomplish)\\??$/.test(text)){
    const a=profile.athletics||{};
    return {reply:`Your biggest goals are to become a stronger and recruitable college athlete, improve your high jump, speed and explosiveness, grow BK Media into a real professional company, shoot larger events, build JARVIS into a serious personal AI assistant, and turn your skills into businesses and income. In short: athletics, media, technology and entrepreneurship.`,permissionRequired:false};
  }
  if(/^(tell me about my photography|what do i do in photography|what kind of photography do i do|what is my photography like)\\??$/.test(text)){
    const b=profile.business||{}, cwork=profile.creativeWork||{};
    return {reply:`Your photography is primarily sports-focused, Sir. You have over ${b.experience||"1.5 years"} of experience and work in sports photography, visual storytelling, cinematic sports imagery, NFL-style color grading, high-jump photography, Rembrandt-style sports portraits and event coverage. Your selling points are strong photos and fast response time.`,permissionRequired:false};
  }
  if(text.includes("what do you know about me")||text.includes("tell me everything about me")){
    const p=profile.identity||{},a=profile.athletics||{},b=profile.business||{},j=profile.jarvisProject||{};
    return {reply:`You are ${p.fullName||"Bryson Kresse"}, age ${p.age||15}, Sir. You are a track-and-field athlete whose primary event is high jump, currently at ${a.currentHighJump||"6'0\""}. Your current squat is ${a.currentSquat||"315 lb"}. You run ${(b.brands||["BK Media"])[0]} and are building a professional sports-media business. You are also building this JARVIS system. I have your complete local profile loaded, plus persistent conversation memory.`,permissionRequired:false};
  }
  if(text.startsWith("remember ")||text.startsWith("don't forget ")){const fact=message.replace(/^(remember|don't forget)\\s+/i,"").trim();if(fact){remember(fact);rememberConversation("user",message);return {reply:"Understood, Sir. I've stored that in local memory.",permissionRequired:false}}}
  if(text.includes("do you remember"))return {reply:memory.facts.length?"Yes, Sir. Recent memories:\\n"+memory.facts.slice(-10).map(x=>"• "+x.text).join("\\n"):"I don't have saved local memories yet, Sir.",permissionRequired:false};
  const calc=calculateExpression(message);if(calc!==null)return {reply:`The answer is ${calc}, Sir.`,permissionRequired:false};
  if(text.includes("what are my")||text.includes("my profile")||text.includes("about me")){const answer=smartProfileAnswer(message);if(answer)return {reply:"Here's what I found in your personal knowledge core, Sir:\\n\\n"+answer,permissionRequired:false}}
  if(text.includes("status"))return {reply:"All primary JARVIS systems are operational, Sir. Local profile and persistent memory are online. Computer control remains permission-gated.",permissionRequired:false};
  if(text.includes("what can you do")||text.includes("capabilities"))return {reply:"I can use your local profile, remember facts, maintain recent conversation memory, calculate, speak, answer built-in knowledge questions, report system status, and prepare permission-gated computer actions. No external AI API is required for these functions.",permissionRequired:false};
  if(text.includes("hello")||text.includes("hey"))return {reply:"Good evening, Sir. All primary systems are online. How may I assist you?",permissionRequired:false};
  const knowledge={
    "what is javascript":"JavaScript is a programming language used heavily for web applications, servers, automation, and interactive software.",
    "what is node":"Node.js is a JavaScript runtime that lets JavaScript run outside the browser, including on servers and local computers.",
    "what is express":"Express is a lightweight Node.js web framework used to build HTTP servers and APIs.",
    "what is an api":"An API is an interface that lets software systems communicate through defined requests and responses.",
    "what is ai":"Artificial intelligence is software designed to perform tasks that normally require human-like reasoning, perception, learning, or decision-making."
  };
  for(const [q,a] of Object.entries(knowledge))if(text===q||text===q+"?")return {reply:a+"\n\nIf you'd like, Sir, I can explain it at a beginner, technical, or JARVIS-builder level.",permissionRequired:false};
  return {reply:`Understood, Sir. I received: "${message}". My local reasoning core is active, but I do not have a cloud model available right now. I can still use your profile, memory, built-in knowledge, calculations, and permission system.`,permissionRequired:false};
}

app.post("/api/chat", async (req, res) => {\n  const message = String(req.body?.message || "").trim();\n  if (!message) return res.status(400).json({ error: "Message required." });\n  try { rememberConversation("user",message); const result=localResponse(message); rememberConversation("assistant",result.reply); res.json(result); }\n  catch (error) { console.error(error); res.status(500).json({ error: "JARVIS encountered an internal error." }); }\n});\n.post("/api/chat", async (req, res) => {
  const message = String(req.body?.message || "").trim();
  if (!message) return res.status(400).json({ error: "Message required." });
  try { res.json(localResponse(message)); }
  catch (error) { console.error(error); res.status(500).json({ error: "JARVIS encountered an internal error." }); }
});

app.use((_req, res) => res.sendFile(path.join(__dirname, "..", "public", "index.html")));

app.listen(PORT, () => console.log(`JARVIS online at http://localhost:${PORT}`));
