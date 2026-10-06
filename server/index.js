require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const {
  initDatabase,
  listUsers,
  getUserByEmail,
  getUserById,
  createUser,
  createComplaint,
  listComplaints,
  getComplaintById,
  updateComplaintStatus,
  getOverviewMetrics,
  listNotificationsForUser,
  insertAuditLog,
  createAlert,
  listAlerts,
  createFeedback,
  getRows,
  getOne,
  runQuery
} = require('./db');
const {
  classifyComplaint,
  findSimilarComplaints,
  generatePredictiveAlert,
  buildClusterSummary,
  buildHotspotSummary,
  calculateRiskForArea,
  departmentMap
} = require('./ai');

const app = express();
const port = process.env.PORT || 5000;

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Unsupported file type'));
  }
});

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadDir));
app.use(rateLimit({ windowMs: 60 * 1000, max: 200 }));

function sanitizeUser(user) {
  if (!user) return null;
  const { password_hash, ...safe } = user;
  return safe;
}

function issueToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET || 'demo-secret', { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(authHeader.replace('Bearer ', ''), process.env.JWT_SECRET || 'demo-secret');
    const user = getUserById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You are not authorized to access this resource' });
    }
    next();
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'CivicPulse AI server is running', timestamp: new Date().toISOString() });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role = 'citizen', phone = '', address = '' } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }
    if (getUserByEmail(email)) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = createUser({
      id: uuidv4(),
      name,
      email: email.trim().toLowerCase(),
      passwordHash: hashed,
      role,
      phone,
      address
    });

    insertAuditLog({ userId: user.id, action: 'register', target: 'user', details: 'New user registration', ipAddress: req.ip });
    const token = issueToken(user);
    return res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to register user', error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = getUserByEmail(email);
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    insertAuditLog({ userId: user.id, action: 'login', target: 'auth', details: 'User login', ipAddress: req.ip });
    const token = issueToken(user);
    return res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ message: 'Login failed', error: error.message });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  return res.json({ user: sanitizeUser(req.user) });
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
  insertAuditLog({ userId: req.user.id, action: 'logout', target: 'auth', details: 'User logout', ipAddress: req.ip });
  res.json({ success: true, message: 'Logged out successfully' });
});

app.get('/api/users', authMiddleware, requireRole('admin'), (_req, res) => {
  return res.json({ users: listUsers().map((user) => {
    const { password_hash, ...safe } = user;
    return safe;
  }) });
});

app.get('/api/complaints', authMiddleware, (req, res) => {
  const complaints = listComplaints();
  const userRole = req.user.role;
  const userId = req.user.id;
  const filtered = userRole === 'citizen'
    ? complaints.filter((complaint) => complaint.user_id === userId)
    : userRole === 'officer'
      ? complaints.filter((complaint) => complaint.assigned_to === userId || complaint.user_id === userId || complaint.status !== 'Resolved')
      : complaints;

  return res.json({ complaints: filtered });
});

app.post('/api/complaints', authMiddleware, upload.array('attachments', 3), (req, res) => {
  try {
    const { title, description, category, subcategory, location, latitude, longitude, address, contactPreference } = req.body;
    if (!title || !description) {
      return res.status(400).json({ message: 'Complaint title and description are required' });
    }

    const analysis = classifyComplaint(title, description);
    const approximateArea = location || 'Ward 17';
    const complaintInput = {
      title,
      description,
      category: analysis.category,
      subcategory: subcategory || analysis.subcategory,
      location: approximateArea,
      latitude: Number(latitude || 28.6139),
      longitude: Number(longitude || 77.2090),
      address: address || `${approximateArea}, Delhi`,
      department: analysis.department,
      area: approximateArea,
      source: 'web',
      contact_preference: contactPreference || 'email',
      user_id: req.user.id,
      severity: analysis.severity,
      priority: analysis.priority,
      department_recommendation: analysis.department,
      risk_score: 54,
      duplicate_probability: 0,
      status: 'Submitted'
    };

    const complaint = createComplaint(complaintInput);
    const similarComplaints = findSimilarComplaints({
      id: complaint.id,
      ...complaintInput,
      title,
      description,
      category: analysis.category,
      latitude: complaintInput.latitude,
      longitude: complaintInput.longitude
    }, listComplaints());

    const update = getComplaintById(complaint.id);
    update.duplicate_probability = similarComplaints[0]?.similarity || 0;
    runQuery('UPDATE complaints SET duplicate_probability = ?, risk_score = ?, department_recommendation = ? WHERE id = ?', [
      update.duplicate_probability,
      Math.min(100, 45 + (similarComplaints[0]?.similarity || 0) / 2),
      analysis.department,
      complaint.id
    ]);

    insertAuditLog({ userId: req.user.id, action: 'create_complaint', target: complaint.id, details: `Complaint ${complaint.complaint_id} created`, ipAddress: req.ip });

    return res.status(201).json({
      message: 'Complaint submitted successfully',
      complaint: getComplaintById(complaint.id),
      analysis,
      duplicates: similarComplaints,
      suggestions: similarComplaints.length ? [`This complaint appears similar to ${similarComplaints[0].complaintNumber}.`] : ['No major duplicates detected.']
    });
  } catch (error) {
    return res.status(500).json({ message: 'Complaint submission failed', error: error.message });
  }
});

app.get('/api/complaints/:id', authMiddleware, (req, res) => {
  const complaint = getComplaintById(req.params.id);
  if (!complaint) return res.status(404).json({ message: 'Complaint not found' });
  const similar = findSimilarComplaints(complaint, listComplaints());
  const risk = calculateRiskForArea(complaint.area || 'Ward 17', listComplaints());
  return res.json({ complaint, similar, risk, analysis: classifyComplaint(complaint.title, complaint.description) });
});

app.post('/api/complaints/:id/analyze', authMiddleware, (req, res) => {
  const complaint = getComplaintById(req.params.id);
  if (!complaint) return res.status(404).json({ message: 'Complaint not found' });
  const analysis = classifyComplaint(complaint.title, complaint.description);
  const similar = findSimilarComplaints(complaint, listComplaints());
  const alert = generatePredictiveAlert(listComplaints());
  return res.json({ analysis, similar, forecast: alert });
});

app.get('/api/complaints/:id/similar', authMiddleware, (req, res) => {
  const complaint = getComplaintById(req.params.id);
  if (!complaint) return res.status(404).json({ message: 'Complaint not found' });
  return res.json({ similar: findSimilarComplaints(complaint, listComplaints()) });
});

app.put('/api/complaints/:id/status', authMiddleware, (req, res) => {
  const { status, comment } = req.body;
  const complaint = getComplaintById(req.params.id);
  if (!complaint) return res.status(404).json({ message: 'Complaint not found' });
  const updated = updateComplaintStatus(req.params.id, status, req.user.id, comment || 'Status changed by staff');
  insertAuditLog({ userId: req.user.id, action: 'status_update', target: req.params.id, details: `${status} status assigned`, ipAddress: req.ip });
  return res.json({ complaint: updated, message: 'Status updated successfully' });
});

app.get('/api/analytics/overview', authMiddleware, (_req, res) => {
  const overview = getOverviewMetrics();
  const complaints = listComplaints();
  const categoryData = [...new Set(complaints.map((item) => item.category))].map((category) => ({
    name: category,
    value: complaints.filter((item) => item.category === category).length
  }));

  const complaintsByDay = complaints.slice(0, 10).map((item) => ({
    date: new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    complaints: Number(item.risk_score || 20)
  }));

  res.json({
    overview,
    categories: categoryData,
    trend: complaintsByDay,
    clusters: buildClusterSummary(complaints),
    hotspots: buildHotspotSummary(complaints),
    riskAlert: generatePredictiveAlert(complaints)
  });
});

app.get('/api/clusters', authMiddleware, (_req, res) => {
  res.json({ clusters: buildClusterSummary(listComplaints()) });
});

app.get('/api/hotspots', authMiddleware, (_req, res) => {
  res.json({ hotspots: buildHotspotSummary(listComplaints()) });
});

app.get('/api/alerts', authMiddleware, (_req, res) => {
  return res.json({ alerts: listAlerts() });
});

app.get('/api/predictions', authMiddleware, (_req, res) => {
  const complaints = listComplaints();
  const allAreas = [...new Set(complaints.map((complaint) => complaint.area || 'Ward 17'))];
  const predictions = allAreas.map((area) => calculateRiskForArea(area, complaints));
  return res.json({ predictions, alert: generatePredictiveAlert(complaints) });
});

app.get('/api/notifications', authMiddleware, (req, res) => {
  return res.json({ notifications: listNotificationsForUser(req.user.id) });
});

app.put('/api/notifications/:id/read', authMiddleware, (req, res) => {
  const notificationId = req.params.id;
  const rows = getRows('SELECT * FROM notifications WHERE id = ? AND user_id = ?', [notificationId, req.user.id]);
  if (!rows.length) return res.status(404).json({ message: 'Notification not found' });
  runQuery('UPDATE notifications SET is_read = 1 WHERE id = ?', [notificationId]);
  return res.json({ message: 'Notification marked as read' });
});

app.get('/api/admin/alerts', authMiddleware, requireRole('admin'), (_req, res) => {
  return res.json({ alerts: listAlerts() });
});

app.post('/api/admin/alerts', authMiddleware, requireRole('admin'), (req, res) => {
  const { title, description, severity, area, startDate, endDate, status = 'active' } = req.body;
  if (!title || !description) return res.status(400).json({ message: 'Alert title and description are required' });
  const alert = createAlert({ title, description, severity, area, startDate, endDate, status });
  insertAuditLog({ userId: req.user.id, action: 'create_alert', target: 'public_alerts', details: title, ipAddress: req.ip });
  return res.status(201).json({ alert, message: 'Public alert created successfully' });
});

app.post('/api/feedback', authMiddleware, (req, res) => {
  const { complaintId, rating, comment, satisfaction } = req.body;
  if (!complaintId || !rating) return res.status(400).json({ message: 'Complaint ID and rating are required' });
  const feedback = createFeedback({ complaintId, userId: req.user.id, rating, comment, satisfaction });
  return res.status(201).json({ feedback, message: 'Feedback recorded successfully' });
});

app.get('/api/departments', authMiddleware, (_req, res) => {
  const departments = getRows('SELECT * FROM departments ORDER BY name');
  return res.json({ departments });
});

app.get('/api/categories', authMiddleware, (_req, res) => {
  const categories = getRows('SELECT * FROM categories ORDER BY name');
  return res.json({ categories });
});

app.get('/api/system-settings', authMiddleware, requireRole('admin'), (_req, res) => {
  const settings = getRows('SELECT * FROM system_settings');
  return res.json({ settings });
});

app.get('/api/demo-summary', authMiddleware, (_req, res) => {
  const complaints = listComplaints();
  return res.json({
    totalComplaints: complaints.length,
    departments: Object.keys(departmentMap),
    alert: generatePredictiveAlert(complaints),
    clusters: buildClusterSummary(complaints),
    recentComplaints: complaints.slice(0, 5)
  });
});

app.get('/api/reports/export', authMiddleware, requireRole('admin'), (_req, res) => {
  const complaints = listComplaints();
  const csv = [
    ['Complaint ID', 'Title', 'Category', 'Status', 'Priority', 'Severity', 'Area'],
    ...complaints.map((complaint) => [complaint.complaint_id, complaint.title, complaint.category, complaint.status, complaint.priority, complaint.severity, complaint.area])
  ].map((row) => row.join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="civicpulse-report.csv"');
  return res.send(csv);
});

app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, '..', 'client', 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  return res.json({ message: 'API is running. Frontend build not generated yet. Use npm run dev in the client folder.' });
});

(async () => {
  await initDatabase();
  app.listen(port, () => {
    console.log(`CivicPulse AI server running on http://localhost:${port}`);
  });
})();

module.exports = app;
