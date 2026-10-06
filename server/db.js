const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { classifyComplaint, generatePredictiveAlert } = require('./ai');

const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'civicpulse.sqlite');

let SQL;
let db;

function ensureDir() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
}

async function initDatabase() {
  if (db) return db;
  SQL = await initSqlJs();
  ensureDir();
  const fileExists = fs.existsSync(DB_PATH);
  if (fileExists) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(new Uint8Array(fileBuffer));
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON;');
  createSchema();
  if (!fileExists) {
    seedDemoData();
    saveDatabase();
  }
  return db;
}

function saveDatabase() {
  if (!db) return;
  const data = Buffer.from(db.export());
  fs.writeFileSync(DB_PATH, data);
}

function runQuery(sql, params = []) {
  if (!db) return null;
  db.run(sql, params);
  saveDatabase();
  return true;
}

function getRows(sql, params = []) {
  if (!db) return [];
  const stmt = db.prepare(sql);
  const rows = [];
  if (params.length) {
    stmt.bind(params);
  }
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function getOne(sql, params = []) {
  const rows = getRows(sql, params);
  return rows[0] || null;
}

function createSchema() {
  const schema = `
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'citizen',
      status TEXT NOT NULL DEFAULT 'active',
      phone TEXT,
      address TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      head TEXT,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id TEXT PRIMARY KEY,
      complaint_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      subcategory TEXT,
      status TEXT NOT NULL DEFAULT 'Submitted',
      severity TEXT NOT NULL DEFAULT 'Moderate',
      priority TEXT NOT NULL DEFAULT 'Medium',
      department TEXT,
      location TEXT,
      latitude REAL,
      longitude REAL,
      address TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT,
      user_id TEXT,
      assigned_to TEXT,
      cluster_id TEXT,
      risk_score INTEGER DEFAULT 0,
      duplicate_probability INTEGER DEFAULT 0,
      department_recommendation TEXT,
      source TEXT DEFAULT 'mobile',
      contact_preference TEXT default 'email',
      area TEXT,
      duplicate_of TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS complaint_status_history (
      id TEXT PRIMARY KEY,
      complaint_id TEXT NOT NULL,
      status TEXT NOT NULL,
      changed_by TEXT,
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(complaint_id) REFERENCES complaints(id)
    );

    CREATE TABLE IF NOT EXISTS complaint_attachments (
      id TEXT PRIMARY KEY,
      complaint_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT,
      path TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS public_alerts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL,
      area TEXT,
      start_date TEXT,
      end_date TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      complaint_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT,
      satisfaction TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(complaint_id) REFERENCES complaints(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      target TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `;

  db.exec(schema);
  insertDefaultRows();
}

function insertDefaultRows() {
  const roleRows = ['citizen', 'officer', 'admin'];
  for (const role of roleRows) {
    db.run('INSERT OR IGNORE INTO roles (id, name) VALUES (?, ?)', [role, role]);
  }

  const categories = [
    'Water', 'Electricity', 'Roads', 'Garbage', 'Drainage', 'Street Lights', 'Public Transport',
    'Sanitation', 'Pollution', 'Public Safety', 'Government Services', 'Other'
  ];

  for (const category of categories) {
    db.run('INSERT OR IGNORE INTO categories (id, name, description) VALUES (?, ?, ?)', [category.toLowerCase(), category, `${category} service request`]);
  }

  const departments = [
    ['water', 'Water Supply Department', 'Chief Engineer'],
    ['electricity', 'Electrical Maintenance Department', 'Superintendent'],
    ['roads', 'Public Works Department', 'Roads Engineer'],
    ['garbage', 'Sanitation Department', 'Operations Head'],
    ['drainage', 'Municipal Drainage Department', 'Drainage Engineer'],
    ['transport', 'Transport Department', 'Transit Manager'],
    ['health', 'Public Health Department', 'Health Officer'],
    ['safety', 'Public Safety Bureau', 'Safety Director']
  ];

  for (const [id, name, head] of departments) {
    db.run('INSERT OR IGNORE INTO departments (id, name, head, active) VALUES (?, ?, ?, 1)', [id, name, head]);
  }
}

function seedDemoData() {
  const bcrypt = require('bcryptjs');
  const { v4: uuidv4 } = require('uuid');

  const adminId = 'admin-1';
  const officerIds = ['officer-1', 'officer-2', 'officer-3', 'officer-4', 'officer-5'];
  const citizenIds = Array.from({ length: 12 }, (_, i) => `citizen-${i + 1}`);

  db.run('INSERT OR REPLACE INTO users (id, name, email, password_hash, role, status, phone, address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [adminId, 'Asha Verma', 'admin@civicpulse.demo', bcrypt.hashSync('CivicPulse@123', 10), 'admin', 'active', '9999999999', 'Civic Center, Sector 18']);

  officerIds.forEach((id, index) => {
    db.run('INSERT OR REPLACE INTO users (id, name, email, password_hash, role, status, phone, address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, `Officer ${index + 1}`, `officer${index + 1}@civicpulse.demo`, bcrypt.hashSync('Officer@123', 10), 'officer', 'active', `98888${index}001`, `Ward ${index + 10}, City`]);
  });

  citizenIds.forEach((id, index) => {
    db.run('INSERT OR REPLACE INTO users (id, name, email, password_hash, role, status, phone, address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, `Citizen ${index + 1}`, `citizen${index + 1}@civicpulse.demo`, bcrypt.hashSync('Citizen@123', 10), 'citizen', 'active', `98765${index}001`, `Area ${index + 1}, Ward ${index + 5}`]);
  });

  const complaintSeeds = [
    { title: 'Water leakage near school gate', category: 'Water', area: 'Ward 18', lat: 28.6129, lon: 77.2295, desc: 'Continuous leakage causing waterlogging and risk to pedestrian movement near the school gate.' },
    { title: 'Broken streetlight on main road', category: 'Street Lights', area: 'Ward 12', lat: 28.6208, lon: 77.2147, desc: 'Streetlight has been non-functional for three nights creating safety hazards.' },
    { title: 'Pothole causing traffic jam', category: 'Roads', area: 'Ward 15', lat: 28.6182, lon: 77.2399, desc: 'Large pothole near the bus stop causing traffic congestion and risk to bikers.' },
    { title: 'Garbage overflow near market', category: 'Garbage', area: 'Ward 21', lat: 28.6315, lon: 77.2261, desc: 'Large amount of uncollected waste has piled up and is attracting pests.' },
    { title: 'Drain blockage after rain', category: 'Drainage', area: 'Ward 18', lat: 28.6137, lon: 77.2269, desc: 'Stagnant water standing after sudden rain and blocked drainage chokes the lane.' },
    { title: 'Power outage affecting hospital area', category: 'Electricity', area: 'Ward 9', lat: 28.6065, lon: 77.2205, desc: 'Repeated power cuts during peak hours disrupt healthcare services and homes.' },
    { title: 'Bus stop shed damaged', category: 'Public Transport', area: 'Ward 11', lat: 28.6033, lon: 77.2438, desc: 'Damaged waiting shelter and poor lighting at a major bus stop.' },
    { title: 'Sewage overflow in lane', category: 'Sanitation', area: 'Ward 17', lat: 28.6122, lon: 77.2145, desc: 'Overflowing sewage has created an unhygienic condition across the lane.' },
    { title: 'Dust pollution near industrial zone', category: 'Pollution', area: 'Ward 7', lat: 28.5988, lon: 77.2864, desc: 'Heavy dust and smoke causes breathing discomfort for nearby residents.' },
    { title: 'Illegal dumping near playground', category: 'Other', area: 'Ward 13', lat: 28.6219, lon: 77.2001, desc: 'Large waste dump accumulated near the children playground.' },
  ];

  const statuses = ['Submitted', 'In Progress', 'Assigned', 'Resolved'];
  const severityLevels = ['Low', 'Moderate', 'High', 'Critical'];

  for (let i = 0; i < 55; i += 1) {
    const seed = complaintSeeds[i % complaintSeeds.length];
    const createdDate = new Date(Date.now() - (i * 2 + 2) * 86400000).toISOString();
    const complaintId = `CP-${10000 + i}`;
    const status = statuses[i % statuses.length];
    const severity = severityLevels[i % severityLevels.length];
    const classification = classifyComplaint(seed.title, seed.desc);
    const riskScore = Math.min(100, 30 + i * 2 + (severity === 'Critical' ? 25 : severity === 'High' ? 16 : severity === 'Moderate' ? 8 : 2));
    const userId = citizenIds[i % citizenIds.length];
    const assignedTo = officerIds[i % officerIds.length];
    const id = `complaint-${i + 1}`;

    db.run(`INSERT OR IGNORE INTO complaints (
      id, complaint_id, title, description, category, subcategory, status, severity,
      priority, department, location, latitude, longitude, address, created_at, updated_at,
      user_id, assigned_to, area, risk_score, duplicate_probability, department_recommendation, source,
      contact_preference
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      id,
      complaintId,
      seed.title,
      seed.desc,
      classification.category,
      classification.subcategory,
      status,
      severity,
      classification.priority,
      classification.department,
      seed.area,
      seed.lat + (i % 5) * 0.002,
      seed.lon + (i % 4) * 0.003,
      `${seed.area} Main Road`,
      createdDate,
      createdDate,
      userId,
      assignedTo,
      seed.area,
      riskScore,
      12 + (i % 50),
      classification.department,
      i % 2 === 0 ? 'mobile app' : 'web',
      'email'
    ]);

    db.run('INSERT OR IGNORE INTO complaint_status_history (id, complaint_id, status, changed_by, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
      `history-${id}`,
      id,
      status,
      assignedTo,
      status === 'Resolved' ? 'Issue addressed and verified.' : 'Complaint registered for review.',
      createdDate
    ]);

    if (i % 4 === 0) {
      db.run('INSERT OR IGNORE INTO notifications (id, user_id, type, title, message, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        `notif-${id}`,
        userId,
        'system',
        'Complaint acknowledgement',
        `Your complaint ${complaintId} has been received and is being reviewed.`,
        i % 2,
        createdDate
      ]);
    }
  }

  db.run('INSERT OR IGNORE INTO public_alerts (id, title, description, severity, area, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
    'alert-1',
    'High waterlogging risk detected',
    'Low-lying roads around Ward 18 are at high risk of waterlogging after heavy rainfall. Citizens are advised to avoid flooded sections.',
    'high',
    'Ward 18',
    new Date(Date.now() - 86400000).toISOString(),
    new Date(Date.now() + 604800000).toISOString(),
    'active'
  ]);

  db.run('INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)', ['default_language', 'en']);
  db.run('INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)', ['ai_mode', 'demo']);

  const predictive = generatePredictiveAlert(getRows('SELECT * FROM complaints'));
  db.run('INSERT OR IGNORE INTO notifications (id, user_id, type, title, message, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    'notif-predictive',
    adminId,
    'predictive',
    'Predictive risk update',
    `${predictive.area}: ${predictive.riskLevel} risk alert based on AI-estimated trend.`,
    0,
    new Date().toISOString()
  ]);

  const publicFeedback = [
    { complaintId: 'CP-10010', rating: 5, comment: 'Fast response and transparent updates.', satisfaction: 'satisfied' },
    { complaintId: 'CP-10018', rating: 4, comment: 'The issue was resolved within expected time.', satisfaction: 'satisfied' },
    { complaintId: 'CP-10026', rating: 3, comment: 'Improved but a little slower than expected.', satisfaction: 'neutral' }
  ];

  publicFeedback.forEach((entry, idx) => {
    const complaint = getOne('SELECT * FROM complaints WHERE complaint_id = ?', [entry.complaintId]);
    if (complaint) {
      db.run('INSERT OR IGNORE INTO feedback (id, complaint_id, user_id, rating, comment, satisfaction, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        `feedback-${idx + 1}`,
        complaint.id,
        complaint.user_id,
        entry.rating,
        entry.comment,
        entry.satisfaction,
        new Date().toISOString()
      ]);
    }
  });
}

function listUsers() {
  return getRows('SELECT * FROM users ORDER BY created_at DESC');
}

function getUserById(userId) {
  return getOne('SELECT * FROM users WHERE id = ?', [userId]);
}

function getUserByEmail(email) {
  return getOne('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
}

function createUser({ id, name, email, passwordHash, role = 'citizen', status = 'active', phone = '', address = '' }) {
  db.run('INSERT INTO users (id, name, email, password_hash, role, status, phone, address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, name, email.toLowerCase(), passwordHash, role, status, phone, address]);
  return getUserById(id);
}

function createComplaint(data) {
  const complaintId = `CP-${Math.floor(10000 + Math.random() * 90000)}`;
  const id = data.id || `complaint-${Date.now()}`;
  db.run(`INSERT INTO complaints (
    id, complaint_id, title, description, category, subcategory, status, severity,
    priority, department, location, latitude, longitude, address, created_at, updated_at,
    user_id, assigned_to, area, risk_score, duplicate_probability, department_recommendation, source,
    contact_preference
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    id,
    complaintId,
    data.title,
    data.description,
    data.category,
    data.subcategory,
    data.status || 'Submitted',
    data.severity || 'Moderate',
    data.priority || 'Medium',
    data.department,
    data.location,
    data.latitude,
    data.longitude,
    data.address,
    new Date().toISOString(),
    new Date().toISOString(),
    data.user_id,
    data.assigned_to || null,
    data.area || 'Ward 17',
    data.risk_score || 30,
    data.duplicate_probability || 0,
    data.department_recommendation || data.department,
    data.source || 'web',
    data.contact_preference || 'email'
  ]);

  if (data.user_id) {
    db.run('INSERT INTO notifications (id, user_id, type, title, message, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      `notif-${Date.now()}`,
      data.user_id,
      'complaint',
      'Complaint submitted',
      `Your complaint ${complaintId} has been accepted and is under review.`,
      0,
      new Date().toISOString()
    ]);
  }

  return getComplaintById(id);
}

function getComplaintById(id) {
  return getOne('SELECT * FROM complaints WHERE id = ?', [id]);
}

function getComplaintByComplaintId(complaintId) {
  return getOne('SELECT * FROM complaints WHERE complaint_id = ?', [complaintId]);
}

function listComplaints() {
  return getRows('SELECT * FROM complaints ORDER BY created_at DESC');
}

function listNotificationsForUser(userId) {
  return getRows('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [userId]);
}

function updateComplaintStatus(complaintId, status, changedBy, comment = '') {
  db.run('UPDATE complaints SET status = ?, updated_at = ? WHERE id = ?', [status, new Date().toISOString(), complaintId]);
  db.run('INSERT INTO complaint_status_history (id, complaint_id, status, changed_by, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
    `history-${Date.now()}`,
    complaintId,
    status,
    changedBy,
    comment,
    new Date().toISOString()
  ]);
  return getComplaintById(complaintId);
}

function insertAuditLog({ userId, action, target, details, ipAddress }) {
  db.run('INSERT INTO audit_logs (id, user_id, action, target, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    `audit-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    userId || null,
    action,
    target || null,
    details || null,
    ipAddress || null,
    new Date().toISOString()
  ]);
}

function listAlerts() {
  return getRows('SELECT * FROM public_alerts ORDER BY created_at DESC');
}

function createAlert({ title, description, severity, area, startDate, endDate, status = 'active' }) {
  const id = `alert-${Date.now()}`;
  db.run('INSERT INTO public_alerts (id, title, description, severity, area, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    id,
    title,
    description,
    severity,
    area,
    startDate,
    endDate,
    status,
    new Date().toISOString()
  ]);
  return getOne('SELECT * FROM public_alerts WHERE id = ?', [id]);
}

function createFeedback({ complaintId, userId, rating, comment, satisfaction }) {
  const id = `feedback-${Date.now()}`;
  const complaint = getComplaintByComplaintId(complaintId);
  if (!complaint) return null;
  db.run('INSERT INTO feedback (id, complaint_id, user_id, rating, comment, satisfaction, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    id,
    complaint.id,
    userId,
    rating,
    comment || '',
    satisfaction || 'satisfied',
    new Date().toISOString()
  ]);
  return getOne('SELECT * FROM feedback WHERE id = ?', [id]);
}

function getOverviewMetrics() {
  const total = getOne('SELECT COUNT(*) as count FROM complaints');
  const pending = getOne('SELECT COUNT(*) as count FROM complaints WHERE status IN ("Submitted", "Assigned")');
  const resolved = getOne('SELECT COUNT(*) as count FROM complaints WHERE status = "Resolved"');
  const critical = getOne('SELECT COUNT(*) as count FROM complaints WHERE severity = "Critical"');
  const inProgress = getOne('SELECT COUNT(*) as count FROM complaints WHERE status = "In Progress"');
  const avgResolution = getOne('SELECT ROUND(AVG(CAST(julianday(CURRENT_TIMESTAMP) - julianday(created_at) AS REAL)), 1) as avg FROM complaints');

  return {
    totalComplaints: total?.count || 0,
    pendingComplaints: pending?.count || 0,
    resolvedComplaints: resolved?.count || 0,
    criticalCases: critical?.count || 0,
    inProgressComplaints: inProgress?.count || 0,
    averageResolutionDays: Number(avgResolution?.avg || 0)
  };
}

module.exports = {
  initDatabase,
  getRows,
  getOne,
  runQuery,
  listUsers,
  getUserByEmail,
  getUserById,
  createUser,
  createComplaint,
  listComplaints,
  getComplaintById,
  getComplaintByComplaintId,
  updateComplaintStatus,
  insertAuditLog,
  getOverviewMetrics,
  listNotificationsForUser,
  createAlert,
  listAlerts,
  createFeedback,
  saveDatabase,
  getRows
};
