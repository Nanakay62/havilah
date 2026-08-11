'use strict';

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const SURVEY_TYPES = ['phq9', 'gad7', 'pss10', 'fas10', 'copsoq3'];
const COPSOQ_DEPTHS = ['core', 'middle', 'long'];
const STATUSES = ['locked', 'unlocked', 'closed'];

const AssessmentCycleSchema = new mongoose.Schema(
  {
    cycle_id: {
      type: String,
      required: true,
      unique: true,
      default: uuidv4
    },
    company_id: {
      type: String,
      required: true,
      index: true
    },
    department_id: {
      type: String,
      default: null
    },
    survey_type: {
      type: String,
      required: true,
      enum: SURVEY_TYPES
    },
    copsoq_depth: {
      type: String,
      enum: COPSOQ_DEPTHS,
      required: function() { return this.survey_type === 'copsoq3'; }
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'locked'
    },
    unlocked_by: {
      type: String
    },
    unlocked_at: {
      type: Date
    },
    deadline: {
      type: Date
    },
    closed_at: {
      type: Date
    },
    completion_count: {
      type: Number,
      default: 0
    },
    created_at: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

AssessmentCycleSchema.index(
  { company_id: 1, department_id: 1, survey_type: 1, status: 1 },
  { name: 'idx_company_dept_survey_status' }
);

/**
 * Returns a map of survey_type -> cycle status for the employee
 */
AssessmentCycleSchema.statics.getActiveForEmployee = async function (companyId, departmentId) {
  const activeCycles = await this.find({
    company_id: companyId,
    status: 'unlocked',
    $or: [{ department_id: null }, { department_id: departmentId }]
  }).lean();

  const statusMap = {};
  for (const cycle of activeCycles) {
    statusMap[cycle.survey_type] = {
      status: cycle.status,
      deadline: cycle.deadline,
      cycle_id: cycle.cycle_id
    };
  }
  return statusMap;
};

module.exports = mongoose.model('AssessmentCycle', AssessmentCycleSchema);
