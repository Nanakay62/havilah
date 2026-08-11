const express = require('../server/node_modules/express');
const mongoose = require('../server/node_modules/mongoose');
const jwt = require('../server/node_modules/jsonwebtoken');
const bcrypt = require('../server/node_modules/bcryptjs');

const path = require('path');
const serverApp = require(path.join(__dirname, '..', 'server', 'server.js'));

console.log("=== DEBUGGING LOGIN & GET /api/v1/auth/me FLOW ===");

async function runDebug() {
  try {
    const User = require('../server/models/User');
    const { hashField } = require('../server/utils/crypto');

    // Create or find a test employee and HR admin
    const email = 'testuser@havilah.io';
    const email_hash = hashField(email);
    const passwordHash = await bcrypt.hash('Password123!', 10);

    let user = await User.findOne({ email_hash });
    if (!user) {
      user = await User.create({
        user_id: 'usr_test_debug_123',
        email_encrypted: 'enc_test',
        email_hash,
        passwordHash,
        full_name: 'Test Debugger',
        role: 'employee',
        company_id: 'ten_debug_999',
        department_id: 'DEPT_01'
      });
    }

    // 1. Create a JWT token exactly as /api/v1/auth/login does
    const payload = {
      userId: user.user_id,
      companyId: user.company_id,
      departmentId: user.department_id,
      role: user.role,
      isSystemSuperAdmin: user.isSystemSuperAdmin || false
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET || 'fallback_secret_for_dev', {
      expiresIn: '24h',
    });

    console.log("Generated Login Token:", token.substring(0, 30) + "...");

    // 2. Test GET /api/v1/auth/me using supertest or node fetch against server
    const http = require('http');
    const PORT = 4999;
    const server = serverApp.listen(PORT, async () => {
      console.log(`Test server running on port ${PORT}`);

      const httpReq = http.request({
        hostname: 'localhost',
        port: PORT,
        path: '/api/v1/auth/me',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          console.log(`GET /api/v1/auth/me Status: ${res.statusCode}`);
          console.log(`GET /api/v1/auth/me Response: ${data}`);
          server.close();
          mongoose.connection.close();
          process.exit(res.statusCode === 200 ? 0 : 1);
        });
      });

      httpReq.on('error', (e) => {
        console.error("HTTP Request Error:", e);
        server.close();
        mongoose.connection.close();
        process.exit(1);
      });

      httpReq.end();
    });

  } catch (err) {
    console.error("Debug script error:", err);
    process.exit(1);
  }
}

runDebug();
