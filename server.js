const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET || (!isProduction ? "local-dev-secret-change-before-deployment" : "");
if (isProduction && !sessionSecret) {
  console.error("Missing SESSION_SECRET. Set a long, random SESSION_SECRET environment variable before deployment.");
  process.exit(1);
}
const databasePath = process.env.DATABASE_PATH || path.join(__dirname, "campusfind.db");
const db = new Database(databasePath);
db.pragma("journal_mode = WAL");

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeExt = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "");
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Please upload a JPG, PNG, WEBP or GIF image."));
  }
});

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('lost','found')),
  item_name TEXT NOT NULL,
  category TEXT NOT NULL,
  colour TEXT DEFAULT '',
  location TEXT NOT NULL,
  item_date TEXT NOT NULL,
  description TEXT DEFAULT '',
  image_path TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','returned')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

const reportCount = db.prepare("SELECT COUNT(*) AS n FROM reports").get().n;
if (reportCount === 0) {
  const demoUser = db.prepare("INSERT OR IGNORE INTO users(name,email,password_hash,role) VALUES(?,?,?,?)");
  demoUser.run("Campus Demo", "demo@campusfind.local", bcrypt.hashSync("DemoPass123!", 10), "admin");
  const user = db.prepare("SELECT id FROM users WHERE email=?").get("demo@campusfind.local");
  const add = db.prepare(`INSERT INTO reports(user_id,kind,item_name,category,colour,location,item_date,description)
    VALUES(?,?,?,?,?,?,?,?)`);
  const samples = [
    ["lost","Student ID Card","ID / cards","Blue","Central Library","2026-10-22","Blue college ID card with a clear plastic holder. Please hand it to the campus office."],
    ["found","Wireless Earbuds","Electronics","White","Cafeteria","2026-10-22","White earbuds case found on a table near the window."],
    ["lost","Black Wallet","Bags & wallets","Black","Sports Ground","2026-10-21","Small black wallet. Owner should verify identifying details privately."],
    ["found","Set of Keys","Keys","Silver","Block B, Room 204","2026-10-21","Three silver keys on a small blue keyring."],
    ["lost","Calculus Notebook","Books & stationery","Green","Engineering Block","2026-10-20","Green notebook with handwritten maths notes."],
    ["found","Water Bottle","Other","Orange","Auditorium","2026-10-20","Orange reusable bottle left under a seat after an event."]
  ];
  for (const s of samples) add.run(user.id, ...s);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true }));
if (isProduction) app.set("trust proxy", 1);
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: isProduction, maxAge: 1000 * 60 * 60 * 4 }
}));
app.use("/uploads", express.static(uploadDir));
app.use(express.static(path.join(__dirname, "public")));

function currentUser(req) {
  if (!req.session.userId) return null;
  return db.prepare("SELECT id,name,email,role FROM users WHERE id=?").get(req.session.userId) || null;
}
function requireLogin(req, res, next) {
  if (!currentUser(req)) return res.status(401).json({ error: "Please log in first." });
  next();
}
function cleanText(value, max = 300) {
  return String(value || "").trim().slice(0, max);
}

app.get("/api/me", (req, res) => res.json({ user: currentUser(req) }));

app.post("/api/register", (req, res) => {
  const name = cleanText(req.body.name, 80);
  const email = cleanText(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || "");
  if (name.length < 2) return res.status(400).json({ error: "Enter your name." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  try {
    const info = db.prepare("INSERT INTO users(name,email,password_hash) VALUES(?,?,?)")
      .run(name, email, bcrypt.hashSync(password, 12));
    req.session.userId = info.lastInsertRowid;
    res.status(201).json({ user: currentUser(req) });
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) return res.status(409).json({ error: "That email is already registered." });
    res.status(500).json({ error: "Could not create account." });
  }
});

app.post("/api/login", (req, res) => {
  const email = cleanText(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Email or password is incorrect." });
  }
  req.session.userId = user.id;
  res.json({ user: currentUser(req) });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/reports", (req, res) => {
  const kind = ["lost", "found"].includes(req.query.kind) ? req.query.kind : null;
  const q = cleanText(req.query.q, 100);
  let sql = `SELECT r.id,r.user_id,r.kind,r.item_name,r.category,r.colour,r.location,r.item_date,
    r.description,r.image_path,r.status,r.created_at,u.name AS reporter
    FROM reports r JOIN users u ON u.id=r.user_id WHERE 1=1`;
  const params = [];
  if (kind) { sql += " AND r.kind=?"; params.push(kind); }
  if (q) {
    sql += " AND (r.item_name LIKE ? OR r.category LIKE ? OR r.colour LIKE ? OR r.location LIKE ? OR r.description LIKE ?)";
    const like = `%${q}%`; params.push(like, like, like, like, like);
  }
  sql += " ORDER BY r.created_at DESC, r.id DESC LIMIT 100";
  const reports = db.prepare(sql).all(...params);
  const stats = {
    open: db.prepare("SELECT COUNT(*) AS n FROM reports WHERE status='open'").get().n,
    found: db.prepare("SELECT COUNT(*) AS n FROM reports WHERE kind='found' AND status='open'").get().n,
    returned: db.prepare("SELECT COUNT(*) AS n FROM reports WHERE status='returned'").get().n
  };
  res.json({ reports, stats });
});

app.get("/api/my-reports", requireLogin, (req, res) => {
  res.json({ reports: db.prepare(`SELECT * FROM reports WHERE user_id=? ORDER BY id DESC`).all(req.session.userId) });
});

app.post("/api/reports", requireLogin, (req, res, next) => {
  upload.single("image")(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    const kind = req.body.kind;
    const itemName = cleanText(req.body.itemName, 80);
    const category = cleanText(req.body.category, 50);
    const location = cleanText(req.body.location, 100);
    const itemDate = cleanText(req.body.itemDate, 10);
    if (!["lost", "found"].includes(kind)) return res.status(400).json({ error: "Choose lost or found." });
    if (!itemName || !category || !location || !/^\d{4}-\d{2}-\d{2}$/.test(itemDate)) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: "Complete all required fields." });
    }
    const imagePath = req.file ? `/uploads/${req.file.filename}` : "";
    const info = db.prepare(`INSERT INTO reports(user_id,kind,item_name,category,colour,location,item_date,description,image_path)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(req.session.userId, kind, itemName, category,
      cleanText(req.body.colour, 40), location, itemDate, cleanText(req.body.description, 500), imagePath);
    res.status(201).json({ report: db.prepare("SELECT * FROM reports WHERE id=?").get(info.lastInsertRowid) });
  });
});

app.post("/api/reports/:id/returned", requireLogin, (req, res) => {
  const report = db.prepare("SELECT * FROM reports WHERE id=?").get(Number(req.params.id));
  if (!report) return res.status(404).json({ error: "Report not found." });
  const user = currentUser(req);
  if (report.user_id !== user.id && user.role !== "admin") return res.status(403).json({ error: "Only the reporter or an admin can mark this returned." });
  db.prepare("UPDATE reports SET status='returned' WHERE id=?").run(report.id);
  res.json({ ok: true });
});

// Explainable, rule-based matching demo. This is not a trained AI model.
app.get("/api/reports/:id/matches", (req, res) => {
  const report = db.prepare("SELECT * FROM reports WHERE id=?").get(Number(req.params.id));
  if (!report) return res.status(404).json({ error: "Report not found." });
  const others = db.prepare(`SELECT id,kind,item_name,category,colour,location,item_date,description,status
    FROM reports WHERE kind<>? AND status='open' AND id<>?`).all(report.kind, report.id);
  const tokens = s => new Set(String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2));
  const base = tokens([report.item_name, report.category, report.colour, report.location, report.description].join(" "));
  const matches = others.map(other => {
    const target = tokens([other.item_name, other.category, other.colour, other.location, other.description].join(" "));
    let common = 0;
    for (const word of base) if (target.has(word)) common++;
    const sameCategory = report.category.toLowerCase() === other.category.toLowerCase();
    const sameLocation = report.location.toLowerCase() === other.location.toLowerCase();
    const score = Math.min(98, Math.round((common / Math.max(1, base.size)) * 65 + (sameCategory ? 20 : 0) + (sameLocation ? 15 : 0)));
    return { ...other, score };
  }).filter(m => m.score >= 15).sort((a,b) => b.score - a.score).slice(0, 5);
  res.json({ matches, note: "Prototype similarity score based on shared words, category and location; not a trained AI confidence score." });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

app.listen(PORT, () => {
  console.log(`CampusFind is running at http://localhost:${PORT}`);
  console.log("Demo sign-in: demo@campusfind.local / DemoPass123!");
});