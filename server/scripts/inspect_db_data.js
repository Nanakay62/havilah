const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const PersonalWellnessLog = require('../models/PersonalWellnessLog');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Department = require('../models/Department');

async function inspect() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB.");

  const tenants = await Tenant.find().lean();
  console.log("TENANTS:", tenants.map(t => ({ company_id: t.company_id, name: t.company_name, used_seats: t.used_seats })));

  const users = await User.find().lean();
  console.log("TOTAL USERS:", users.length);
  users.forEach(u => console.log(`User: ${u.email}, role: ${u.role}, company: ${u.company_id}, dept: ${u.department_id}`));

  const logs = await PersonalWellnessLog.find().lean();
  console.log("TOTAL PERSONAL WELLNESS LOGS:", logs.length);
  logs.forEach(l => console.log(`Log: company=${l.company_id}, user=${l.user_id}, type=${l.survey_type}, score=${l.clinical_score || l.composite_score || l.overallIndex}`));

  await mongoose.disconnect();
}

inspect();
