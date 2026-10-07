import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);

const PROFILE_FILE = path.join(__dirname, "..", "data", "bryson.json");
const MEMORY_FILE = path.join(__dirname, "..", "data", "memory.json");

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

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return fallback; }
}

function saveJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

let profile = loadJson(PROFILE_FILE, {});
let memory = loadJson(MEMORY_FILE, {
  facts: [],
  preferences: { voice: "male butler", theme: "dark futuristic", accent: "red" },
  conversation: []
});

if (!Array.isArray(memory.facts)) memory.facts = [];
if (!Array.isArray(memory.conversation)) memory.conversation = [];

const auditLog = [];

function logAction(action, status, details = "") {
  auditLog.push({ timestamp: new Date().toISOString(), action, status, details });
  if (auditLog.length > 500) auditLog.shift();
}

function remember(text) {
  memory.facts.push({ text, createdAt: new Date().toISOString() });
  memory.facts = memory.facts.slice(-200);
  saveJson(MEMORY_FILE, memory);
}

function rememberConversation(role, text) {
  memory.conversation.push({ role, text: String(text), createdAt: new Date().toISOString() });
  memory.conversation = memory.conversation.slice(-100);
  saveJson(MEMORY_FILE, memory);
}

function flatten(value, prefix = "", out = []) {
  if (value === null || value === undefined) return out;
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? prefix + "." + key : key, out);
    }
  } else {
    out.push({ path: prefix, value: String(value) });
  }
  return out;
}

function profileSearch(query) {
  const terms = String(query)
    .toLowerCase()
    .replace(/[^a-z0-9' -]/g, " ")
    .split(/\s+/)
    .filter(term => term.length > 2);

  return flatten(profile)
    .map(item => ({
      ...item,
      score: terms.reduce((score, term) => {
        return score + ((item.path + " " + item.value).toLowerCase().includes(term) ? 1 : 0);
      }, 0)
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

function classifyCommand(message) {
  const text = message.toLowerCase();

  if (text.includes("delete") || text.includes("format")) {
    return { permission: "locked", action: "delete_file" };
  }

  if (text.includes("shutdown") || text.includes("turn off computer")) {
    return { permission: "locked", action: "shutdown" };
  }

  if (
    text.includes("open ") ||
    text.includes("launch ") ||
    text.includes("run ") ||
    text.includes("execute ")
  ) {
    return { permission: "approval", action: "run_command" };
  }

  return { permission: "safe", action: "chat" };
}

function calculateExpression(message) {
  const percent = message.match(/(?:what is|calculate|compute)\s+([0-9.]+)%\s+of\s+([0-9.]+)$/i);
  if (percent) {
    return (Number(percent[1]) / 100) * Number(percent[2]);
  }

  const match = message.match(/(?:calculate|compute|what is)\s+([0-9+\-*/().%\s]+)$/i);
  if (!match) return null;

  const expression = match[1].trim();
  if (!/^[0-9+\-*/().%\s]+$/.test(expression)) return null;

  try {
    const result = Function('"use strict"; return (' + expression + ")")();
    return Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function cleanQuestion(message) {
  return String(message)
    .toLowerCase()
    .trim()
    .replace(/[?!.]+$/g, "")
    .replace(/\s+/g, " ");
}

function normalizedWords(text) {
  return cleanQuestion(text)
    .replace(/[^a-z0-9' ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function hasAny(text, phrases) {
  return phrases.some(phrase => text.includes(phrase));
}

const curriculum = {
  mathematics: ["arithmetic","algebra","geometry","trigonometry","precalculus","calculus","multivariable calculus","linear algebra","differential equations","probability","statistics","discrete mathematics","number theory","numerical methods","real analysis","complex analysis","abstract algebra","topology","optimization"],
  physics: ["classical mechanics","electricity and magnetism","waves","optics","thermodynamics","statistical mechanics","quantum mechanics","special relativity","general relativity","fluid mechanics","solid state physics","nuclear physics","particle physics","astrophysics"],
  chemistry: ["general chemistry","organic chemistry","inorganic chemistry","physical chemistry","analytical chemistry","biochemistry","materials chemistry","spectroscopy","chemical kinetics","thermochemistry"],
  biology: ["cell biology","molecular biology","genetics","evolution","ecology","microbiology","immunology","physiology","anatomy","neuroscience","developmental biology","biotechnology","bioinformatics"],
  computerScience: ["programming","data structures","algorithms","computer architecture","operating systems","databases","computer networks","distributed systems","software engineering","compilers","cybersecurity","cryptography","artificial intelligence","machine learning","deep learning","computer graphics","human-computer interaction"],
  engineering: ["mechanical engineering","electrical engineering","computer engineering","civil engineering","chemical engineering","aerospace engineering","biomedical engineering","industrial engineering","materials engineering","systems engineering","robotics","control systems"],
  business: ["accounting","finance","economics","marketing","management","operations","entrepreneurship","business law","organizational behavior","strategy","supply chains","business analytics"],
  socialSciences: ["psychology","sociology","anthropology","political science","international relations","human geography","economics","criminology","communication","public policy"],
  humanities: ["history","philosophy","ethics","logic","literature","linguistics","religious studies","classics","cultural studies","art history"],
  health: ["anatomy","physiology","pathology","pharmacology","epidemiology","public health","nutrition","kinesiology","exercise science","health sciences"],
  law: ["constitutional law","criminal law","civil law","contracts","property law","torts","administrative law","international law","legal reasoning"],
  earthSpace: ["geology","geophysics","meteorology","oceanography","climatology","environmental science","astronomy","planetary science","astrophysics"],
  creative: ["visual art","graphic design","photography","film","cinema","music theory","music production","theater","creative writing","architecture"],
  applied: ["education","journalism","media studies","hospitality","tourism","agriculture","forestry","urban planning","library science"]
};

function curriculumAnswer(text) {
  const t = cleanQuestion(text);
  const aliases = {
    math: "mathematics", mathematics: "mathematics", physics: "physics", chemistry: "chemistry",
    biology: "biology", cs: "computerScience", "computer science": "computerScience",
    engineering: "engineering", business: "business", economics: "business",
    psychology: "socialSciences", sociology: "socialSciences", history: "humanities",
    philosophy: "humanities", law: "law", medicine: "health", health: "health",
    kinesiology: "health", astronomy: "earthSpace", geology: "earthSpace",
    art: "creative", design: "creative", film: "creative", journalism: "applied"
  };
  const key = Object.keys(aliases).find(k => t.includes(k));
  if (!key) return null;
  const field = aliases[key];
  const subjects = curriculum[field];
  if (!subjects) return null;
  if (hasAny(t, ["what do you know about", "what can you teach me", "what is covered", "what subjects", "what does it include", "curriculum", "tell me about", "explain", "teach me", "what is"])) {
    const display = field === "computerScience" ? "computer science" : field === "earthSpace" ? "earth and space science" : field === "socialSciences" ? "the social sciences" : field === "humanities" ? "the humanities" : field === "creative" ? "creative fields" : field === "applied" ? "applied fields" : field;
    const summaries = {
      chemistry: "Chemistry is the study of matter—its composition, structure, properties and reactions. At college level, the core path usually starts with atomic structure, periodic trends, chemical bonding, stoichiometry, gases, thermochemistry, kinetics, equilibrium, acids and bases, and electrochemistry, then moves into organic, inorganic, analytical and physical chemistry.",
      mathematics: "Mathematics studies quantity, structure, space, patterns and change. A college foundation progresses through algebra, trigonometry, calculus, linear algebra, differential equations, probability and statistics, with advanced paths into analysis, abstract algebra, topology and optimization.",
      physics: "Physics studies matter, energy, motion, forces, fields, space and time. A college foundation covers mechanics, waves, electricity and magnetism, thermodynamics, optics, relativity and quantum mechanics.",
      biology: "Biology studies living systems from molecules and cells to organisms, populations and ecosystems. College foundations include cell biology, genetics, evolution, physiology, microbiology, ecology and molecular biology.",
      computerScience: "Computer science studies computation and information. A college foundation includes programming, data structures, algorithms, computer architecture, operating systems, databases, networks, software engineering, cybersecurity and artificial intelligence."
    };
    return `${summaries[field] || `I have a structured college-level foundation for ${display}. The major areas include ${subjects.join(", ")}.`} I can teach it from beginner level through advanced college material, Sir.`;
  }
  return null;
}

function answerFromProfile(text) {
  const p = profile.identity || {};
  const a = profile.athletics || {};
  const b = profile.business || {};
  const j = profile.jarvisProject || {};
  const c = profile.creativeWork || {};

  if (hasAny(text, ["what do i do", "what is my job", "what do i do for work", "what do i do for a living"])) {
    return `You have several connected roles, Sir. You're a track-and-field athlete, primarily a high jumper, and you run ${(b.brands || ["BK Media"])[0]}, your sports-media business. You shoot sports photography and video, cover events, and are building BK Media into a professional company. You're also building JARVIS and developing your skills across technology and entrepreneurship.`;
  }

  if (hasAny(text, ["what are my businesses", "what business do i run", "what companies do i have", "what do i own"])) {
    return `Your media brands are ${(b.brands || ["BK Media"]).join(", ")}. Your core business is sports photography, sports videography, media production, event coverage and sports content. Your goal is to turn BK Media into a legitimate professional sports-media company.`;
  }

  if (hasAny(text, ["what sport do i play", "what sport am i in", "what athletics do i do", "what events do i do"])) {
    return `You're a track-and-field athlete, Sir. High jump is your primary event, and you also compete in the 100m, long jump and discus. Your current high jump is ${a.currentHighJump || "6'0\""} and your current squat is ${a.currentSquat || "315 lb"}.`;
  }

  if (hasAny(text, ["how high do i jump", "what is my high jump", "what do i jump"])) {
    return `Your current high jump is ${a.currentHighJump || "6'0\""}, Sir. Your current squat is ${a.currentSquat || "315 lb"}.`;
  }

  if (hasAny(text, ["what am i working on", "what am i building", "what projects am i working on", "what are my projects"])) {
    return "You're building BK Media into a professional sports-media company, developing your track-and-field and recruiting career, building JARVIS into a serious personal AI assistant, creating professional websites and digital products, and turning your existing skills into income.";
  }

  if (hasAny(text, ["what are my goals", "what are my main goals", "what am i trying to accomplish", "where am i headed"])) {
    return "Your major goals are athletic development and recruiting, growing BK Media, shooting larger events, building JARVIS, learning technology, and turning your skills into real businesses and income.";
  }

  if (hasAny(text, ["tell me about my photography", "what kind of photography", "what photography do i do", "what am i good at in photography"])) {
    return `Your work is primarily sports photography and visual storytelling. You have ${b.experience || "over 1.5 years"} of experience and work with cinematic sports imagery, sports portraits, high-jump photography, color grading and event coverage. Your stated selling points are great photos and fast response time.`;
  }

  if (hasAny(text, ["what do you know about me", "tell me everything about me", "tell me about myself", "who is bryson"])) {
    return `You're ${p.fullName || "Bryson Kresse"}, age ${p.age || 15}, Sir. You're based in ${p.location || "Alabama, USA"}, you're a track-and-field athlete with high jump as your primary event, and you currently jump ${a.currentHighJump || "6'0\""} and squat ${a.currentSquat || "315 lb"}. You run ${(b.brands || ["BK Media"])[0]} and have ${b.experience || "over 1.5 years"} of sports-media experience. You're also building JARVIS and pursuing a future across sports, media, technology and entrepreneurship.`;
  }

  if (hasAny(text, ["what is jarvis", "what am i building jarvis", "tell me about my ai", "what are you supposed to be"])) {
    return `I'm JARVIS, your personal AI assistant, Sir. The project is designed around long-term memory, your personal profile, voice interaction, permission-controlled computer access, task planning and a futuristic interface. The current core runs locally without requiring an external AI API.`;
  }

  if (hasAny(text, ["what are my preferences", "how do i like you to respond", "how should you talk to me"])) {
    const pref = profile.assistantPreferences || {};
    return `You want me called JARVIS and you want me to address you as ${pref.addressUserAs || "Sir"}. Your preferred style is ${pref.tone || "calm, capable, professional and futuristic"}, with a ${pref.voice || "male butler"} voice and a ${pref.theme || "dark futuristic"} interface. You prefer action over theory and finished solutions over vague explanations.`;
  }

  if (hasAny(text, ["what are my strengths", "what am i good at", "what are my skills"])) {
    const skills = (c.skills || []).slice(0, 8);
    return skills.length ? "Some of your strongest skills include " + skills.join(", ") + "." : null;
  }

  return null;
}

function conversationalAnswer(text) {
  if (hasAny(text, ["good morning", "good afternoon", "good evening"])) {
    return "Good evening, Sir. JARVIS is online and ready.";
  }
  if (hasAny(text, ["thanks", "thank you"])) return "You're welcome, Sir.";
  if (hasAny(text, ["are you there", "you there", "are you online"])) return "Always, Sir. All local JARVIS systems are online.";
  if (hasAny(text, ["who are you"])) return "I am JARVIS, your personal AI assistant, Sir.";
  return null;
}

function contextualReply(text) {
  const recent = memory.conversation.slice(-12);
  const lastAssistant = [...recent].reverse().find(x => x.role === "assistant")?.text || "";
  if (!lastAssistant) return null;
  if (hasAny(text, ["tell me more", "go deeper", "explain more", "more about that", "elaborate"])) {
    if (/BK Media|sports-media|photography/i.test(lastAssistant)) return "Absolutely, Sir. The bigger picture with BK Media is to build a real sports-media operation with consistent branding, professional coverage, strong client relationships, fast delivery and access to larger events.";
    if (/high jump|track-and-field|athlete/i.test(lastAssistant)) return "Absolutely, Sir. Your athletic path is centered on becoming a stronger and more recruitable track athlete, with high jump as the main event. That means improving speed, explosiveness, technique, strength and overall athletic development.";
    if (/JARVIS|AI assistant/i.test(lastAssistant)) return "Absolutely, Sir. The direction for JARVIS is a personal assistant that knows you, remembers conversations, speaks naturally, helps plan tasks and eventually interacts with your Mac through explicit permission gates.";
  }
  if (hasAny(text, ["what did you just say", "what were you saying", "what was that"])) return lastAssistant;
  if (hasAny(text, ["yes", "yeah", "yep", "sure", "okay", "ok"])) return "Understood, Sir. I'm with you.";
  return null;
}

function localResponse(message) {
  const normalized = cleanQuestion(message);
  const contextReply = contextualReply(normalized);
  if (contextReply) return { reply: contextReply, permissionRequired: false };
  const curriculumReply = curriculumAnswer(normalized);
  if (curriculumReply) return { reply: curriculumReply, permissionRequired: false };
  const profileReply = answerFromProfile(normalized);
  if (profileReply) return { reply: profileReply, permissionRequired: false };

  const conversationalReply = conversationalAnswer(normalized);
  if (conversationalReply) return { reply: conversationalReply, permissionRequired: false };

  const command = classifyCommand(message);
  const text = cleanQuestion(message);

  if (command.permission === "locked") {
    logAction(command.action, "blocked", message);
    return {
      reply: "I cannot execute that operation without the required security authorization, Sir.",
      permissionRequired: true,
      permissionLevel: "locked",
      action: command.action
    };
  }

  if (command.permission === "approval") {
    logAction(command.action, "approval_required", message);
    return {
      reply: "That action requires your approval, Sir. I have not executed it.",
      permissionRequired: true,
      permissionLevel: "approval",
      action: command.action
    };
  }

  if (text === "who am i" || text === "what is my name") {
    return {
      reply: "You are Bryson Kresse, Sir. Your surname is pronounced Kre-ss-ee.",
      permissionRequired: false
    };
  }

  if (
    text === "what do i do" ||
    text === "what is my job" ||
    text === "what do i do for work" ||
    text === "what do i do for a living" ||
    text === "what is my work"
  ) {
    const b = profile.business || {};
    const a = profile.athletics || {};
    return {
      reply:
        `You have two major lanes, Sir. You're a track-and-field athlete with high jump as your primary event. Your current high jump is ${a.currentHighJump || "6'0\""} and your current squat is ${a.currentSquat || "315 lb"}. You also run ${(b.brands || ["BK Media"])[0]}, a sports-media business focused on sports photography, videography, media production and event coverage. You've covered NBA G League, college football, high school football and track. You're also building JARVIS as your personal AI system.`,
      permissionRequired: false
    };
  }

  if (
    text.includes("what are my businesses") ||
    text.includes("what business do i run") ||
    text.includes("what companies do i have") ||
    text === "tell me about my business"
  ) {
    const b = profile.business || {};
    return {
      reply:
        `Your main business is ${(b.brands || ["BK Media"])[0]}. Related names include ${(b.brands || []).slice(1).join(", ")}. Your work includes sports photography, sports videography, media production, event coverage and sports content. Your goal is to turn BK Media into a legitimate professional sports-media company.`,
      permissionRequired: false
    };
  }

  if (
    text.includes("what sport do i play") ||
    text.includes("what sports do i do") ||
    text.includes("what is my main sport")
  ) {
    const a = profile.athletics || {};
    return {
      reply:
        `You compete in track and field, Sir. High jump is your primary event, and you also do the 100m, long jump and discus. Your current high jump is ${a.currentHighJump || "6'0\""} and your current squat is ${a.currentSquat || "315 lb"}.`,
      permissionRequired: false
    };
  }

  if (
    text.includes("what am i working on") ||
    text.includes("what am i building") ||
    text.includes("what projects am i working on")
  ) {
    return {
      reply:
        "You're working on several major things, Sir: building BK Media into a professional sports-media company, developing your track-and-field and recruiting career, building this JARVIS personal AI system, creating professional websites and digital products, and turning your media skills into income.",
      permissionRequired: false
    };
  }

  if (
    text.includes("what are my goals") ||
    text.includes("what are my priorities") ||
    text.includes("what am i trying to accomplish")
  ) {
    return {
      reply:
        "Your biggest priorities are athletics, BK Media, technology and entrepreneurship. You want to improve as a high jumper, become more recruitable, grow BK Media into a real professional company, shoot larger events, and build JARVIS into a serious personal AI assistant.",
      permissionRequired: false
    };
  }

  if (
    text.includes("tell me about my photography") ||
    text.includes("what kind of photography do i do") ||
    text.includes("what do i do in photography")
  ) {
    const b = profile.business || {};
    return {
      reply:
        `Your photography is primarily sports-focused, Sir. You have ${b.experience || "over 1.5 years"} of experience and work in sports photography, visual storytelling, cinematic sports imagery, sports portraits, event coverage and sports content. Your main selling points are great photos and fast response time.`,
      permissionRequired: false
    };
  }

  if (
    text.includes("what do you know about me") ||
    text.includes("tell me everything about me") ||
    text === "tell me about myself"
  ) {
    const p = profile.identity || {};
    const a = profile.athletics || {};
    const b = profile.business || {};

    return {
      reply:
        `You are ${p.fullName || "Bryson Kresse"}, age ${p.age || 15}, Sir. You're a track-and-field athlete whose primary event is high jump, currently at ${a.currentHighJump || "6'0\""}, with a current squat of ${a.currentSquat || "315 lb"}. You run ${(b.brands || ["BK Media"])[0]} and have ${b.experience || "over 1.5 years"} of sports-media experience. You're also building JARVIS and working toward a professional future across sports, media, technology and entrepreneurship.`,
      permissionRequired: false
    };
  }

  if (text.startsWith("remember ") || text.startsWith("don't forget ")) {
    const fact = message.replace(/^(remember|don't forget)\s+/i, "").trim();
    if (fact) {
      remember(fact);
      return { reply: "Understood, Sir. I've stored that in local memory.", permissionRequired: false };
    }
  }

  if (text.includes("do you remember")) {
    return {
      reply: memory.facts.length
        ? "Yes, Sir. Here's what I remember: " + memory.facts.slice(-8).map(x => x.text).join(". ") + "."
        : "I don't have saved local memories yet, Sir.",
      permissionRequired: false
    };
  }

  const calculation = calculateExpression(message);
  if (calculation !== null) {
    return { reply: `The answer is ${calculation}, Sir.`, permissionRequired: false };
  }

  if (text.includes("status")) {
    return {
      reply: "All primary JARVIS systems are operational, Sir. Local profile and persistent memory are online. Computer control remains permission-gated.",
      permissionRequired: false
    };
  }

  if (text.includes("what can you do") || text.includes("capabilities")) {
    return {
      reply: "I can use your local profile, remember facts, maintain recent conversation memory, calculate, speak, answer built-in knowledge questions, report system status, and prepare permission-gated computer actions.",
      permissionRequired: false
    };
  }

  if (text === "hello" || text === "hey" || text === "hi") {
    return {
      reply: "Good evening, Sir. All primary systems are online. How may I assist you?",
      permissionRequired: false
    };
  }

  const knowledge = {
    "what is javascript": "JavaScript is a programming language used heavily for web applications, servers, automation and interactive software.",
    "what is node": "Node.js is a JavaScript runtime that lets JavaScript run outside the browser, including on servers and local computers.",
    "what is express": "Express is a lightweight Node.js web framework used to build HTTP servers and APIs.",
    "what is an api": "An API is an interface that lets software systems communicate through defined requests and responses.",
    "what is ai": "Artificial intelligence is software designed to perform tasks that normally require human-like reasoning, perception, learning or decision-making.",
    "what is history": "History is the study of past events, people, societies and civilizations using evidence such as documents, artifacts, oral traditions and archaeology.",
    "what is mathematics": "Mathematics is the study of quantity, structure, space, patterns, change and logical relationships. Major areas include arithmetic, algebra, geometry, trigonometry, calculus, statistics and discrete mathematics.",
    "what is physics": "Physics studies matter, energy, motion, forces, fields, space and time and the laws describing how they interact.",
    "what is chemistry": "Chemistry studies matter, its properties, composition, structure and the reactions that transform it.",
    "what is biology": "Biology is the study of living organisms, including their structure, function, evolution, genetics and ecosystems.",
    "what is geography": "Geography studies Earth's places, environments, physical systems, human populations and how people interact with space.",
    "what is economics": "Economics studies how people and institutions allocate scarce resources, including production, trade, prices, incentives and markets.",
    "what is government": "Government is the system through which a society makes and enforces collective rules, provides public functions and exercises political authority.",
    "what is computer science": "Computer science studies computation, algorithms, data, software, computer systems, networks, artificial intelligence and information processing.",
    "what is calculus": "Calculus is the mathematical study of change and accumulation. Differential calculus studies rates of change and derivatives, while integral calculus studies accumulation and areas.",
    "what is linear algebra": "Linear algebra studies vectors, matrices, linear transformations, vector spaces and systems of linear equations. It is fundamental to physics, engineering, computer graphics and machine learning.",
    "what is probability": "Probability is the mathematical framework for describing uncertainty and random events.",
    "what is statistics": "Statistics is the science of collecting, analyzing, interpreting and communicating data.",
    "what is machine learning": "Machine learning is a branch of artificial intelligence in which algorithms learn patterns from data to make predictions or decisions.",
    "what is quantum mechanics": "Quantum mechanics is the physical theory describing matter and energy at microscopic scales, where systems exhibit quantization, probability and wave-particle behavior.",
    "what is evolution": "Biological evolution is change in inherited characteristics of populations across generations. Natural selection is one major mechanism of evolution.",
    "what is economics": "Economics studies how people and institutions make choices under scarcity and how resources, goods and services are produced, exchanged and distributed.",
    "what is psychology": "Psychology is the scientific study of behavior and mental processes.",
    "what is philosophy": "Philosophy investigates fundamental questions about reality, knowledge, reason, ethics, mind, language and existence.",
    "what is sociology": "Sociology studies societies, social relationships, institutions, groups and patterns of human behavior.",
    "what is political science": "Political science studies governments, political institutions, political behavior, public policy and power.",
    "what is anthropology": "Anthropology studies humans across cultures and time, including biological, archaeological, linguistic and cultural dimensions.",
    "what is geology": "Geology studies Earth, its materials, structure, history and the processes that shape the planet.",
    "what is astronomy": "Astronomy studies stars, planets, galaxies, black holes, cosmology and other objects and phenomena beyond Earth.",
    "what is ethics": "Ethics is the philosophical study of right and wrong, duties, values, moral responsibility and how people ought to act."
  };

  if (knowledge[text]) {
    return {
      reply: knowledge[text] + " If you'd like, Sir, I can explain it at a beginner, technical or JARVIS-builder level.",
      permissionRequired: false
    };
  }

  const profileAnswer = profileSearch(message);
  if (profileAnswer.length) {
    return {
      reply: "I know quite a bit about that, Sir. " + profileAnswer.slice(0, 6).map(item => item.value).join(". ") + ".",
      permissionRequired: false
    };
  }

  return {
    reply:
      `Understood, Sir. I received: "${message}". My local JARVIS reasoning core is active, but I don't have a cloud AI model available. I can still use your personal profile, memory, built-in knowledge, calculations and permission system.`,
    permissionRequired: false
  };
}

app.get("/api/health", (_req, res) => {
  res.json({
    online: true,
    assistant: config.name,
    owner: config.owner.firstName,
    mode: "offline-local",
    profileLoaded: Object.keys(profile).length > 0,
    externalAPI: false
  });
});

app.get("/api/config", (_req, res) => res.json(config));
app.get("/api/permissions", (_req, res) => res.json(permissions));
app.get("/api/memory", (_req, res) => res.json(memory));
app.get("/api/profile", (_req, res) => res.json(profile));
app.get("/api/audit", (_req, res) => res.json(auditLog));

app.post("/api/memory", (req, res) => {
  const { key, value } = req.body || {};
  if (!key) return res.status(400).json({ error: "Memory key required." });
  memory.preferences[key] = value;
  saveJson(MEMORY_FILE, memory);
  logAction("remember_preference", "approved", key + " = " + value);
  res.json({ success: true, memory });
});

app.post("/api/chat", async (req, res) => {
  const message = String(req.body?.message || "").trim();
  if (!message) return res.status(400).json({ error: "Message required." });

  try {
    rememberConversation("user", message);
    const result = localResponse(message);

    // If the local knowledge core does not recognize the question,
    // use Wikipedia's public reference API as a knowledge fallback.
    if (/^Understood, Sir\. I received:/i.test(result.reply)) {
      const cleaned = message
        .replace(/^(who|what|when|where|why|how)\s+/i, "")
        .replace(/[?!.]+$/g, "")
        .trim();

      if (cleaned.length >= 3) {
        try {
          const url = "https://en.wikipedia.org/api/rest_v1/page/summary/" +
            encodeURIComponent(cleaned.replace(/ /g, "_"));
          const response = await fetch(url, {
            headers: { "User-Agent": "JARVIS-BK/1.0" }
          });

          if (response.ok) {
            const data = await response.json();
            if (data.extract) {
              result.reply = data.extract + " If you'd like, Sir, I can go deeper into that subject.";
              result.knowledgeSource = "Wikipedia";
            }
          }
        } catch {
          // Stay fully functional offline if the reference service is unavailable.
        }
      }
    }

    rememberConversation("assistant", result.reply);
    res.json(result);
  } catch (error) {
    console.error("JARVIS chat error:", error);
    res.status(500).json({ error: "JARVIS encountered an internal error." });
  }
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, () => {
  console.log("JARVIS online at http://localhost:" + PORT);
});
