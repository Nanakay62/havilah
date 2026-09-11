'use strict';

const { z } = require('zod');

const LoginSchema = z.object({
  email: z.string({ required_error: 'Email is required' }).email('Invalid email format').max(320),
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required').max(128),
});

const RegisterSchema = z.object({
  email: z.string({ required_error: 'Email is required' }).email('Invalid email format').max(320),
  password: z.string({ required_error: 'Password is required' })
    .min(12, 'Password must be at least 12 characters long.')
    .max(128, 'Password must not exceed 128 characters.')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
    .regex(/\d/, 'Password must contain at least one number.')
    .regex(/[^a-zA-Z\d]/, 'Password must contain at least one special character.'),
  fullName: z.string().min(1, 'Full name is required').max(512).optional(),
  full_name: z.string().min(1, 'Full name is required').max(512).optional(),
  code: z.string().max(64).optional(),
  invite: z.string().max(64).optional(),
}).refine(data => data.fullName || data.full_name, {
  message: 'Full name is required',
  path: ['fullName'],
});

const DemoRequestSchema = z.object({
  email: z.string({ required_error: 'Work email is required' }).email('Please enter a valid work email.').max(320),
});

module.exports = {
  LoginSchema,
  RegisterSchema,
  DemoRequestSchema,
};
