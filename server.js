require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const cors = require('cors');
const validator = require('validator');
const session = require('express-session');
const MongoStore = require('connect-mongo');

const app = express();

// --- Security Middlewares ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
    }
  }
}));

// --- Rate Limiter ---
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60,
  message: { message: 'Too many requests, please try again later.' }
});
app.use(limiter);

// --- Body Parsers ---
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// --- MongoDB Setup ---
const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

// --- Session Setup ---
app.use(session({
  secret: process.env.SESSION_SECRET || 'supersecretkey',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGO_URI }),
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 1000 // 1 hour
  }
}));

// --- CORS ---
if (process.env.NODE_ENV === 'production') {
  app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
} else {
  app.use(cors({ origin: true, credentials: true }));
}

// --- Serve Static Files ---
app.use(express.static(path.join(__dirname, 'public')));

// --- Registration Schema ---
const registrationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  city: { type: String, trim: true },
  address: { type: String, trim: true },
  createdAt: { type: Date, default: Date.now }
});
const Registration = mongoose.model('Registration', registrationSchema);

// --- Helper Validation ---
function validateRegistration(data) {
  const errors = [];
  if (!data.name || data.name.length < 2) errors.push('Invalid name');
  if (!data.phone || !/^[0-9+\- ]{6,20}$/.test(data.phone)) errors.push('Invalid phone');
  if (!data.email || !validator.isEmail(data.email)) errors.push('Invalid email');
  return errors;
}

// --- Public API for registrations ---
app.post('/api/register', async (req, res) => {
  try {
    const { name, phone, email, city = '', address = '' } = req.body;
    const errors = validateRegistration({ name, phone, email });
    if (errors.length) return res.status(400).json({ message: errors.join(', ') });

    const thirtyDaysAgo = new Date(Date.now() - 30*24*60*60*1000);
    const exists = await Registration.findOne({
      $or: [{ email }, { phone }],
      createdAt: { $gte: thirtyDaysAgo }
    });
    if (exists) return res.status(409).json({ message: 'Already registered recently.' });

    const doc = new Registration({ name, phone, email, city, address });
    await doc.save();
    return res.status(201).json({ message: 'Registration saved' });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// --- Healthcheck ---
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// --- Admin Middleware ---
function requireLogin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ success: false, message: 'Not logged in' });
}

// --- Admin Pages ---
app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// --- Admin Login Route (JSON) ---
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
    req.session.isAdmin = true;
    // JSON response instead of redirect
    return res.json({ success: true, message: "Logged in successfully" });
  }
  res.status(401).json({ success: false, message: "Invalid credentials" });
});


// --- Admin Logout ---
app.get('/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true, message: 'Logged out' }));
});

// --- Admin Dashboard ---
app.get('/admin', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// --- Admin Registrations API ---
app.get('/admin/registrations', requireLogin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      Registration.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      Registration.countDocuments()
    ]);

    res.json({ success: true, data, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

// --- Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

