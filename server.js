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

// --- CORS ---
app.use(cors({
  origin: process.env.FRONTEND_URL, // FRONTEND_URL from env
  methods: ["GET", "POST"],
  credentials: true
}));

// --- Helmet CSP ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", process.env.FRONTEND_URL], // allow frontend API requests
    }
  }
}));

// --- Rate Limiter ---
app.use(rateLimit({
  windowMs: 1*60*1000,
  max: 60,
  message: { message: 'Too many requests, try again later.' }
}));

// --- Body Parsers ---
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// --- MongoDB ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => { console.error('MongoDB connection error:', err.message); process.exit(1); });

// --- Session ---
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60*60*1000
  }
}));

// --- Static files ---
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

// --- Validation ---
function validateRegistration(data) {
  const errors = [];
  if (!data.name || data.name.length < 2) errors.push('Invalid name');
  if (!data.phone || !/^[0-9+\- ]{6,20}$/.test(data.phone)) errors.push('Invalid phone');
  if (!data.email || !validator.isEmail(data.email)) errors.push('Invalid email');
  return errors;
}

// --- API: Register ---
app.post('/api/register', async (req, res) => {
  try {
    const { name, phone, email, city='', address='' } = req.body;
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
    return res.status(201).json({ success: true, message: 'Registration saved' });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// --- Healthcheck ---
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// --- Admin ---
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// --- Admin Registrations API ---
app.get('/admin/registrations', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page-1)*limit;

    const [data, total] = await Promise.all([
      Registration.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      Registration.countDocuments()
    ]);

    res.json({ success: true, data, total, page, pages: Math.ceil(total/limit) });
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
