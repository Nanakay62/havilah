'use strict';

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * DepartmentSnapshot — point-in-time capture of department metadata.
 *
 * Every hazard-log submission records a snapshot of the department as it
 * existed at the moment the survey was completed.  This decouples
 * historical analytics from organisational restructures.
 */
const DepartmentSnapshotSchema = new mongoose.Schema(
  {
    snapshot_id: {
      type: String,
      required: [true, 'snapshot_id is required'],
      unique: true,
      default: uuidv4,
      immutable: true,
    },
    department_id: {
      type: String,
      required: [true, 'department_id is required'],
    },
    company_id: {
      type: String,
      required: [true, 'company_id is required'],
    },
    name_at_time: {
      type: String,
      required: [true, 'name_at_time is required'],
      trim: true,
    },
    parent_id_at_time: {
      type: String,
      default: null,
    },
    path_at_time: {
      type: String,
      default: '',
      trim: true,
    },
    version_at_time: {
      type: Number,
      required: [true, 'version_at_time is required'],
      min: 1,
    },
    snapshot_at: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  {
    timestamps: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* ───── compound indexes ───── */
DepartmentSnapshotSchema.index(
  { company_id: 1, snapshot_id: 1 },
  { name: 'idx_company_snapshot_unique' }
);
DepartmentSnapshotSchema.index(
  { company_id: 1, department_id: 1, snapshot_at: -1 },
  { name: 'idx_company_dept_snapshot_time' }
);

/* ───── static: create a snapshot from a live department document ───── */

/**
 * Creates a snapshot from a Department mongoose document.
 *
 * @param {object} department — A Department document (or lean object).
 * @returns {Promise<mongoose.Document>}
 */
DepartmentSnapshotSchema.statics.capture = function capture(department) {
  return this.create({
    department_id: department.department_id,
    company_id: department.company_id,
    name_at_time: department.name,
    parent_id_at_time: department.parent_department_id || null,
    path_at_time: department.path || '',
    version_at_time: department.version || 1,
  });
};

module.exports = mongoose.model('DepartmentSnapshot', DepartmentSnapshotSchema);
