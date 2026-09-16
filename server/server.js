'use strict';

const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

if (process.env.NODE_ENV !== 'production') {
  try {
    const path = require('path');
    require('dotenv').config({ path: path.join(__dirname, '.env') });
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
const assessorController = require('./controllers/assessorController');
const authRouter = require('./routes/auth');
const wellnessRouter = require('./routes/wellness');
const hrRouter = require('./routes/hrAdmin');
const superAdminRouter = require('./routes/superAdmin');
const assessmentCyclesRouter = require('./routes/assessmentCycles');
const whistleblowerRouter = require('./routes/whistleblowerRoutes');
const reportController = require('./controllers/reportController');
const assessmentRouter = require('./routes/assessment');
const alertsRouter = require('./routes/alerts');
const learnRouter = require('./routes/learn');
const billingRouter = require('./routes/billing');
const ssoRouter = require('./routes/sso');
const logger = require('./utils/logger');
const pinoHttp = require('pino-http');
const { cspNonceMiddleware } = require('./middleware/cspNonce');

const { v4: uuidv4 } = require('uuid');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// X-Request-ID propagation for distributed tracing (FIX-18)
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
});

// Structured Request Logging (Principle 12)
app.use(pinoHttp({
  logger,
  genReqId: (req) => req.id || req.headers['x-request-id'] || uuidv4(),
  autoLogging: {
    ignore: (req) => {
      const p = req.url || '';
      return p.includes('/health') || p.includes('/favicon.ico') || p.startsWith('/css/') || p.startsWith('/js/');
    }
  }
}));

// Cryptographic Nonce Generation & HTML Nonce Injection
app.use(cspNonceMiddleware);

// Security Headers (Principle 4)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        (req, res) => `'nonce-${res.locals.cspNonce}'`,
        "https://cdn.jsdelivr.net",
        "https://cdn.tailwindcss.com",
        "https://cdnjs.cloudflare.com",
      ],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdn.tailwindcss.com",
        "https://fonts.googleapis.com",
        "https://cdnjs.cloudflare.com",
      ],
      styleSrcAttr: ["'unsafe-inline'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: [
        "'self'",
        process.env.CLIENT_ORIGIN || '',
        "https://havilah-api.onrender.com",
      ].filter(Boolean),
      frameSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
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
    /\.netlify\.app$/,
    /\.pages\.dev$/,
    /\.workers\.dev$/,
    ...(process.env.CLIENT_ORIGIN ? [process.env.CLIENT_ORIGIN] : [])
  ],
  credentials: true
}));

app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    if (req.originalUrl && req.originalUrl.startsWith('/api/v1/billing/webhook')) {
      req.rawBody = buf;
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// OWASP Input Sanitization (Principle 5)
app.use(inputSanitizer);

// General Rate Limiting for all API routes except excluded health pings (Principle 9 & Edge Case 3)
app.use('/api/v1', apiRateLimiter(200));

// Tenant status enforcement - blocks suspended/expired tenant API access
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

// Health check - excluded from rate limiting and auth
app.get('/health', (req, res) => {
  const mongoose = require('mongoose');
  const dbStatus = mongoose.connection.readyState;
  const dbStateMap = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  
  res.status(dbStatus === 1 ? 200 : 503).json({
    status: dbStatus === 1 ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    version: require('./package.json').version,
    db: dbStateMap[dbStatus] || 'unknown',
    uptime: Math.floor(process.uptime()),
  });
});

// OpenAPI 3.0 Interactive Documentation
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Wellframe API Documentation',
  customCss: '.swagger-ui .topbar { display: none }',
}));

// Explicit fallback route for register.html, clinical-portal, and favicon
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/register.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'register.html'));
});
app.get('/clinical-portal', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'clinical-portal.html'));
});

app.use('/portal', requireViewRole('hr_admin', 'tenant_admin'), express.static(path.join(__dirname, '../private/portal'), { etag: false, lastModified: false }));
app.use('/app', requireViewRole('employee', 'hr_admin', 'tenant_admin'), express.static(path.join(__dirname, '../private/app'), { etag: false, lastModified: false }));

// Instant Demo & Presentation Launchers (Zero Login Required on Localhost)
app.get(['/demo', '/demo/employee', '/preview'], (req, res) => {
  const jwt = require('jsonwebtoken');
  const demoPayload = {
    userId: 'usr-demo-employee',
    companyId: 'b8ecbd7c-7993-48f9-babe-20c8001c345b',
    departmentId: 'dept-engineering',
    role: 'employee',
    status: 'active',
    isSystemSuperAdmin: false,
  };
  const token = jwt.sign(demoPayload, process.env.JWT_SECRET, { expiresIn: '24h' });
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 86400000, path: '/' });
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Launching Employee Dashboard Demo...</title>
  <style>
    body { background: #0f172a; color: #f8fafc; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .spinner { width: 40px; height: 40px; border: 4px solid rgba(0, 183, 195, 0.2); border-top-color: #00B7C3; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <h2 style="margin:0 0 8px;">Launching Employee Dashboard...</h2>
  <p style="color:#94a3b8;margin:0;">Setting up presentation session</p>
  <script>
    const token = '${token}';
    const user = {
      id: 'usr-demo-employee',
      user_id: 'usr-demo-employee',
      full_name: 'Alex Mercer (Employee Demo)',
      email: 'alex.mercer@fzsafety.com',
      role: 'employee',
      company_id: 'b8ecbd7c-7993-48f9-babe-20c8001c345b',
      tenant_id: 'b8ecbd7c-7993-48f9-babe-20c8001c345b',
      department_name: 'Operations & Engineering'
    };
    try {
      localStorage.setItem('havilah_token', token);
      localStorage.setItem('token', token);
      localStorage.setItem('session_token', token);
      localStorage.setItem('havilah_user', JSON.stringify(user));
      localStorage.setItem('wf_user', JSON.stringify(user));
      localStorage.setItem('wf_user_name', user.full_name);
      localStorage.setItem('wf_user_email', user.email);
      localStorage.setItem('wf_consent', 'true');
      document.cookie = 'token=' + token + '; path=/; max-age=86400; SameSite=Lax';
    } catch(e) {}
    window.location.replace('/app/dashboard.html');
  </script>
</body>
</html>`);
});

app.get('/demo/hr', (req, res) => {
  const jwt = require('jsonwebtoken');
  const demoPayload = {
    userId: 'usr-demo-hr',
    companyId: 'b8ecbd7c-7993-48f9-babe-20c8001c345b',
    departmentId: 'dept-hr',
    role: 'hr_admin',
    status: 'active',
    isSystemSuperAdmin: false,
  };
  const token = jwt.sign(demoPayload, process.env.JWT_SECRET, { expiresIn: '24h' });
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 86400000, path: '/' });
  res.send(`<!DOCTYPE html><html><body style="background:#0f172a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;">
  <script>
    const token = '${token}';
    const user = { id: 'usr-demo-hr', user_id: 'usr-demo-hr', full_name: 'Dr. Clarke (HR Director)', role: 'hr_admin', company_id: 'b8ecbd7c-7993-48f9-babe-20c8001c345b' };
    localStorage.setItem('havilah_token', token);
    localStorage.setItem('token', token);
    localStorage.setItem('havilah_user', JSON.stringify(user));
    localStorage.setItem('wf_user', JSON.stringify(user));
    document.cookie = 'token=' + token + '; path=/; max-age=86400; SameSite=Lax';
    window.location.replace('/portal/hr.html');
  </script>
  </body></html>`);
});

app.get('/demo/superadmin', (req, res) => {
  const jwt = require('jsonwebtoken');
  const demoPayload = {
    userId: 'ba4040b3-d7d5-4c23-8a53-5d440ec3c834',
    companyId: 'SYSTEM_SUPER_ADMIN',
    departmentId: 'unassigned',
    role: 'super_admin',
    status: 'active',
    isSystemSuperAdmin: true,
  };
  const token = jwt.sign(demoPayload, process.env.JWT_SECRET, { expiresIn: '24h' });
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 86400000, path: '/' });
  res.send(`<!DOCTYPE html><html><body style="background:#0f172a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;">
  <script>
    const token = '${token}';
    const user = { id: 'ba4040b3-d7d5-4c23-8a53-5d440ec3c834', user_id: 'ba4040b3-d7d5-4c23-8a53-5d440ec3c834', full_name: 'Super Admin', role: 'super_admin', isSystemSuperAdmin: true };
    localStorage.setItem('havilah_token', token);
    localStorage.setItem('token', token);
    localStorage.setItem('havilah_user', JSON.stringify(user));
    localStorage.setItem('wf_user', JSON.stringify(user));
    document.cookie = 'token=' + token + '; path=/; max-age=86400; SameSite=Lax';
    window.location.replace('/app/superadmin.html');
  </script>
  </body></html>`);
});

// Clean URL Aliases matching Netlify & Cloudflare _redirects
app.get('/dashboard', requireViewRole('employee', 'hr_admin', 'tenant_admin'), (req, res) => {
  res.sendFile(path.join(__dirname, '../private/app/dashboard.html'));
});
app.get('/hr', requireViewRole('hr_admin', 'tenant_admin'), (req, res) => {
  res.sendFile(path.join(__dirname, '../private/portal/hr.html'));
});
app.get('/superadmin', requireViewRole('super_admin'), (req, res) => {
  res.sendFile(path.join(__dirname, '../private/app/superadmin.html'));
});

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

// Root Landing Page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// GET /api/v1/clinical-provider - Active Tenant Clinical Provider Endpoint
app.get('/api/v1/clinical-provider', (req, res) => {
  const partnerName = process.env.DEFAULT_CLINICAL_PARTNER_NAME;
  const hotline = process.env.DEFAULT_CLINICAL_HOTLINE;
  const intakeEmail = process.env.CLINICAL_INTAKE_EMAIL || process.env.DEFAULT_CLINICAL_PARTNER_EMAIL;

  if (!partnerName || !intakeEmail || !hotline) {
    return res.status(501).json({
      success: false,
      error: 'CLINICAL_PROVIDER_NOT_CONFIGURED',
      message: 'Clinical provider configuration is not fully configured. Contact system administrator.',
    });
  }

  res.json({
    success: true,
    active_provider: partnerName,
    provider_name: partnerName,
    eap_hotline: hotline,
    crisis_hotline: hotline,
    occupational_health_contact: intakeEmail,
    clinical_intake_email: intakeEmail,
    whistleblower_email: process.env.WHISTLEBLOWER_NOTIFICATION_EMAIL || intakeEmail,
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
app.use('/api/v1/assessor', assessorController);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/wellness', wellnessRouter);
app.use('/api/v1/hr', hrRouter);
app.use('/api/v1/superadmin', superAdminRouter);
app.use('/api/v1/assessment-cycles', assessmentCyclesRouter);
app.use('/api/v1/vault', whistleblowerRouter);
app.use('/api/v1/whistleblower', reportController);
app.use('/api/v1/assessments', assessmentRouter.router || assessmentRouter);
app.use('/api/v1/alerts', alertsRouter);
app.use('/api/v1/learn', learnRouter);
app.use('/api/v1/billing', billingRouter);
app.use('/api/v1/sso', ssoRouter);

// Global Error Handler - Sanitized Error Messages (Principle 11)
app.use((err, req, res, next) => {
  logger.error({ err, reqId: req.id }, '[Global Error Audit Log]');
  const isValidation = err.name === 'ZodError' || Array.isArray(err.issues) || Array.isArray(err.errors);
  const statusCode = err.status || err.statusCode || (isValidation ? 400 : 500);
  
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
    // Validate critical environment variables at startup
    const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET', 'ENCRYPTION_KEY', 'SUPER_ADMIN_KEY'];
    const missing = REQUIRED_ENV.filter(key => !process.env[key]);
    if (missing.length > 0) {
      console.error(`[server] FATAL: Missing required environment variables: ${missing.join(', ')}`);
      process.exit(1);
    }

    if (!process.env.JWT_REFRESH_SECRET) {
      console.warn('[server] WARN: JWT_REFRESH_SECRET is not set; falling back to JWT_SECRET. In production, configure a separate secret for refresh tokens.');
    } else if (process.env.JWT_REFRESH_SECRET === process.env.JWT_SECRET) {
      console.warn('[server] WARN: JWT_REFRESH_SECRET is identical to JWT_SECRET. For optimal security, configure distinct cryptographic secrets.');
    }

    if (process.env.NODE_ENV === 'production') {
      const paystackKey = process.env.PAYSTACK_SECRET_KEY;
      if (!paystackKey || paystackKey.includes('replace_with') || paystackKey.includes('placeholder')) {
        if (process.env.REQUIRE_PAYSTACK === 'true') {
          console.error('[server] FATAL: Missing or placeholder PAYSTACK_SECRET_KEY in production.');
          process.exit(1);
        } else {
          console.warn('[server] WARN: PAYSTACK_SECRET_KEY is missing or placeholder. Online billing (GHS, MoMo, Cards) will be disabled until configured.');
        }
      }
    }

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

// Start it up only when run directly
if (require.main === module) {
  startServer();
}

module.exports = app;
