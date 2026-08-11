'use strict';

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * Department schema — supports arbitrary nesting via materialized path.
 *
 * The `path` field stores the full ancestry chain using dot-delimited slugs
 * (e.g. 'engineering.frontend.react') enabling efficient subtree queries
 * with a prefix regex against the { company_id, path } compound index.
 */
const DepartmentSchema = new mongoose.Schema(
  {
    department_id: {
      type: String,
      required: [true, 'department_id is required'],
      unique: true,
      default: uuidv4,
      immutable: true,
      validate: {
        validator(v) {
          return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
        },
        message: 'department_id must be a valid UUID v4',
      },
    },
    company_id: {
      type: String,
      required: [true, 'company_id is required'],
      index: true,
    },
    parent_department_id: {
      type: String,
      default: null,
    },
    name: {
      type: String,
      required: [true, 'name is required'],
      trim: true,
      minlength: [1, 'name must not be empty'],
      maxlength: [256, 'name must be at most 256 characters'],
    },
    canonical_name: {
      type: String,
      required: [true, 'canonical_name is required'],
      immutable: true,
      trim: true,
    },
    path: {
      type: String,
      default: '',
      trim: true,
    },
    depth: {
      type: Number,
      default: 0,
      min: [0, 'depth cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'depth must be an integer',
      },
    },
    version: {
      type: Number,
      default: 1,
      min: [1, 'version must be >= 1'],
      validate: {
        validator: Number.isInteger,
        message: 'version must be an integer',
      },
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* ───── compound indexes ───── */
DepartmentSchema.index(
  { company_id: 1, department_id: 1 },
  { unique: true, name: 'idx_company_department_unique' }
);
DepartmentSchema.index(
  { company_id: 1, parent_department_id: 1 },
  { name: 'idx_company_parent' }
);
DepartmentSchema.index(
  { company_id: 1, path: 1 },
  { name: 'idx_company_path' }
);

/* ───── pre-save: compute depth from path ───── */
DepartmentSchema.pre('save', function preSaveDepartment(next) {
  if (this.path) {
    this.depth = this.path.split('.').length - 1;
  } else {
    this.depth = 0;
  }
  next();
});

/* ───── pre-save: on rename increment version ───── */
DepartmentSchema.pre('save', function preSaveVersionBump(next) {
  if (!this.isNew && this.isModified('name')) {
    this.version += 1;
  }
  next();
});

/* ───── statics ───── */

/**
 * Find all descendants of a department within a tenant using the
 * materialized path prefix.
 *
 * @param {string} companyId
 * @param {string} pathPrefix — e.g. 'engineering.frontend'
 * @returns {Promise<Array>}
 */
DepartmentSchema.statics.findDescendants = function findDescendants(companyId, pathPrefix) {
  return this.find({
    company_id: companyId,
    path: { $regex: `^${pathPrefix}\\.`, $options: 'i' },
    is_active: true,
  }).lean();
};

/**
 * Build or resolve the full department tree for a company.
 *
 * @param {string} companyId
 * @returns {Promise<Array>}
 */
DepartmentSchema.statics.getTree = function getTree(companyId) {
  return this.find({ company_id: companyId, is_active: true })
    .sort({ path: 1 })
    .lean();
};

module.exports = mongoose.model('Department', DepartmentSchema);
