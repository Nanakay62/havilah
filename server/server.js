'use strict';

if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config();
  } catch (e) {
    console.log('dotenv not found or not required in production environment');
  }
}
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { connectDB } = require('./config/db');
const { initScheduler } = require('./scheduler/complianceScheduler');
const { checkTenantStatus } = require('./middleware/tenantIsolation');
const cookieParser = require('cookie-parser');
const path = require('path');
const requireViewRole = require('./middleware/requireViewRole');
const { apiRateLimiter, sensitiveRateLimiter } = require('./middleware/rateLimiter');
const inputSanitizer = require('./middleware/sanitizer');

// Routers
const hazardController = require('./controllers/hazardController');
const onboardingController = require('./controllers/onboardingController');
const adminController = require('./controllers/adminController');
const tenantController = require('./controllers/tenantController');
const resourceController = require('./controllers/resourceController');
const referralController = require('./controllers/referralController');
const authRouter = require('./routes/auth');
const wellnessRouter = require('./routes/wellness');
const hrRouter = require('./routes/hrAdmin');
const superAdminRouter = require('./routes/superAdmin');
const assessmentCyclesRouter = require('./routes/assessmentCycles');
const whistleblowerRouter = require('./routes/whistleblowerRoutes');
const assessmentRouter = require('./routes/assessment');
const alertsRouter = require('./routes/alerts');

const app = express();
const PORT = process.env.PORT || 3000;

// Security Headers (Principle 4)
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for local testing/prototype
  frameguard: { action: 'deny' },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' }
}));

// Strictly locked CORS Configuration (Principle 10)
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    /\.vercel\.app$/,
    /\.netlify\.app$/
  ],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// OWASP Input Sanitization (Principle 5)
app.use(inputSanitizer);

// General Rate Limiting for all API routes except excluded health pings (Principle 9 & Edge Case 3)
app.use('/api/v1', apiRateLimiter(200));

// Tenant status enforcement — blocks suspended/expired tenant API access
// Runs after auth on each route; passes through if no session data
app.use('/api/v1', checkTenantStatus);

// Disable caching for sensitive responses
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Static Files & Guarded Views
app.use(express.static(path.join(__dirname, '../public'), { etag: false, lastModified: false }));

// Explicit fallback route for register.html
app.get('/register.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'register.html'));
});

app.use('/portal', requireViewRole('hr_admin', 'tenant_admin'), express.static(path.join(__dirname, '../private/portal'), { etag: false, lastModified: false }));
app.use('/app', requireViewRole('employee'), express.static(path.join(__dirname, '../private/app'), { etag: false, lastModified: false }));

// Demo Lead Endpoint with Sensitive Rate Limiter (Principle 3 & 9)
app.post('/api/v1/demo-request', sensitiveRateLimiter(5), async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, error: "Please enter a valid work email." });
    }

    const DemoLead = require('./models/DemoLead');
    const { sendMail } = require('./utils/emailService');

    // 1. Save lead to DB
    await DemoLead.create({ email: email.trim().toLowerCase(), requestedAt: new Date() });

    // 2. Dispatch email notification (API Key strictly in process.env)
    await sendMail({
      from: '"Wellframe Platform" <no-reply@wellframe.app>',
      to: process.env.ADMIN_EMAIL || 'admin@wellframe.app',
      subject: '🔥 New Demo Request Submitted',
      html: `<p>A new prospect requested a demo: <b>${email}</b></p>`
    });

    res.json({ success: true, message: "Thank you! We'll reach out shortly." });
  } catch (err) {
    next(err);
  }
});

// Root Redirect
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// GET /api/v1/clinical-provider — Active Tenant Clinical Provider Endpoint
app.get('/api/v1/clinical-provider', (req, res) => {
  res.json({
    success: true,
    active_provider: process.env.DEFAULT_CLINICAL_PARTNER_NAME || 'FZ Safety and Health',
    provider_name: process.env.DEFAULT_CLINICAL_PARTNER_NAME || 'FZ Safety and Health',
    eap_hotline: process.env.DEFAULT_CLINICAL_HOTLINE || '0551022714',
    crisis_hotline: '988',
    occupational_health_contact: process.env.DEFAULT_CLINICAL_PARTNER_EMAIL || 'nanakwamedickson62@gmail.com',
    allow_custom_eap_overrides: true
  });
});

// Mount Routes
app.use('/api/v1/hazard-logs', hazardController);
app.use('/api/v1/onboarding', onboardingController);
app.use('/api/v1/admin', adminController);
app.use('/api/v1/tenant', tenantController);
app.use('/api/v1/resources', resourceController);
app.use('/api/v1/referrals', referralController);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/wellness', wellnessRouter);
app.use('/api/v1/hr', hrRouter);
app.use('/api/v1/superadmin', superAdminRouter);
app.use('/api/v1/assessment-cycles', assessmentCyclesRouter);
app.use('/api/v1/vault', whistleblowerRouter);
app.use('/api/v1/assessments', assessmentRouter.router || assessmentRouter);
app.use('/api/v1/alerts', alertsRouter);

// Global Error Handler — Sanitized Error Messages (Principle 11)
app.use((err, req, res, next) => {
  console.error('[Global Error Audit Log]', err);
  const statusCode = err.status || err.statusCode || 500;
  
  // Return generic user-friendly message without internal schema or stack details
  res.status(statusCode).json({
    success: false,
    error: statusCode === 400 ? (err.message || 'Bad Request') :
           statusCode === 401 ? 'Authentication required' :
           statusCode === 403 ? (err.message || 'Access denied') :
           statusCode === 404 ? 'Resource not found' :
           'An error occurred while processing your request.'
  });
});

// Startup wrapper
async function startServer() {
  try {
    // 1. Connect to Database
    await connectDB();

    // 2. Start Scheduler
    initScheduler();

    // 3. Listen
    const server = app.listen(PORT, () => {
      console.log(`[server] Wellframe SaaS Platform running on port ${PORT}`);
      console.log(`[server] Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Graceful shutdown logic
    const gracefulShutdown = () => {
      console.log('[server] Received kill signal, shutting down gracefully.');
      server.close(() => {
        console.log('[server] Closed out remaining connections.');
        process.exit(0);
      });
      setTimeout(() => {
        console.error('[server] Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (err) {
    console.error('[server] Failed to start server:', err);
    process.exit(1);
  }
}

// Start it up
startServer();

module.exports = app;
