const https = require('https');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const token = jwt.sign(
  {
    userId: 'cc637f42-8ca3-4c11-a2e4-07b62be9ce13',
    companyId: '146622f6-27f0-45fd-9236-9555e138793c',
    departmentId: 'fd5c65d7-005d-425d-addc-b6cc9952ec80',
    role: 'employee',
    isSystemSuperAdmin: false
  },
  process.env.JWT_SECRET || 'jwt_secret_dev_key',
  { expiresIn: '1d' }
);

function postAuth(url, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      port: 443,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': `Bearer ${token}`
      },
      timeout: 30000
    };

    const start = Date.now();
    console.log(`\nPOSTing with Auth to: ${url}...`);
    const req = https.request(options, (res) => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => {
        const duration = Date.now() - start;
        console.log(`Status: ${res.statusCode} (${duration}ms)`);
        console.log(`Response:`, resData.slice(0, 300));
        resolve({ statusCode: res.statusCode, duration, data: resData });
      });
    });

    req.on('error', (err) => {
      console.error(`Request error:`, err.message);
      resolve({ error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      console.error(`Request timed out after 30s!`);
      resolve({ timeout: true });
    });

    req.write(data);
    req.end();
  });
}

async function run() {
  const payload = {
    patientName: "Nana Kwame Dickson",
    patientContact: "nanakwamedickson62@gmail.com",
    departmentName: "Engineering",
    topic: "Workplace ergonomics",
    preferredDate: "2026-08-25",
    preferredTime: "11:00 AM",
    notes: "Automated test"
  };

  console.log("=== VERIFYING NETLIFY & RENDER API INTEGRATION ===");
  await postAuth('https://havilah-api.onrender.com/api/v1/referrals/occupational-health', payload);
  await postAuth('https://havilahss.netlify.app/api/v1/referrals/occupational-health', payload);
}

run();
