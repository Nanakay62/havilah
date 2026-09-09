'use strict';

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Wellframe / Havilah Workplace Psychosocial Risk & Health Platform API',
      version: '1.0.0',
      description: `
**Wellframe (Havilah)** is an enterprise multi-tenant B2B SaaS platform for occupational mental health, psychosocial risk management, and ISO 45003 compliance.

### Security Architecture:
- **AES-256-GCM** encryption at rest for all personally identifiable information (PII).
- **Zero-PII Hazard Logging**: Anonymous submissions are structurally stripped of user identification.
- **N-Size Privacy Threshold**: Aggregated HR metrics are suppressed when respondent count < 5.
- **Audit Hash-Chaining**: Tamper-evident SHA-256 chained audit logs.
      `,
      contact: {
        name: 'Havilah Health Platform Operations',
        url: 'https://havilah.app',
      },
    },
    servers: [
      {
        url: '/api/v1',
        description: 'Version 1 API Base',
      },
      {
        url: '/',
        description: 'Root Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT access token.',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'token',
          description: 'Session cookie automatically set on login.',
        },
        adminKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-admin-key',
          description: 'Super Admin master API key.',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'VALIDATION_ERROR' },
            message: { type: 'string', example: 'Detailed error explanation' },
          },
        },
        HealthCheck: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'ok' },
            timestamp: { type: 'string', format: 'date-time' },
            version: { type: 'string', example: '1.0.0' },
            db: { type: 'string', example: 'connected' },
            uptime: { type: 'number', example: 120 },
          },
        },
      },
    },
    paths: {
      '/health': {
        get: {
          summary: 'Platform Health Check',
          description: 'Public liveness & readiness probe for load balancers and uptime monitoring.',
          tags: ['System'],
          responses: {
            200: {
              description: 'Service operational',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthCheck' } } },
            },
            503: { description: 'Database degraded or disconnected' },
          },
        },
      },
      '/clinical-provider': {
        get: {
          summary: 'Active Clinical Provider Information',
          description: 'Retrieves designated occupational health and crisis partner contacts.',
          tags: ['Clinical'],
          responses: {
            200: { description: 'Clinical provider details retrieved' },
            501: { description: 'Provider configuration missing' },
          },
        },
      },
      '/auth/login': {
        post: {
          summary: 'Employee & Admin Authentication',
          tags: ['Authentication'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email', example: 'employee@acme.com' },
                    password: { type: 'string', format: 'password', example: 'SecretP@ss123' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Login successful, JWT access and refresh tokens returned' },
            401: { description: 'Invalid credentials' },
          },
        },
      },
      '/auth/refresh': {
        post: {
          summary: 'Rotate Access Token',
          description: 'Exchanges a valid 7-day refresh token for a fresh access token.',
          tags: ['Authentication'],
          responses: {
            200: { description: 'Token refreshed successfully' },
            401: { description: 'Missing or expired refresh token' },
          },
        },
      },
      '/auth/erase-account': {
        post: {
          summary: 'GDPR Article 17 Right to Erasure',
          description: 'Permanently deletes user account and personal wellness records upon password verification.',
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
          tags: ['Privacy & GDPR'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['password'],
                  properties: {
                    password: { type: 'string', format: 'password' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Account and personal data permanently erased' },
            401: { description: 'Incorrect password confirmation' },
          },
        },
      },
      '/wellness/export': {
        get: {
          summary: 'GDPR Article 20 Data Portability Export',
          description: 'Downloads all historical personal wellness logs as a structured JSON file.',
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
          tags: ['Privacy & GDPR'],
          responses: {
            200: {
              description: 'JSON file download',
              headers: {
                'Content-Disposition': {
                  schema: { type: 'string', example: 'attachment; filename="my-wellbeing-data.json"' },
                },
              },
            },
          },
        },
      },
      '/hr/analytics': {
        get: {
          summary: 'HR Department & Organizational Risk Metrics',
          description: 'Aggregates psychosocial risk indicators. Strictly enforces N >= 5 anonymity threshold.',
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
          tags: ['HR & Compliance'],
          parameters: [
            { name: 'department', in: 'query', schema: { type: 'string' }, description: 'Target department ID or name' },
          ],
          responses: {
            200: { description: 'Aggregated analytics or privacy SUPPRESSED response' },
          },
        },
      },
      '/hr/trends': {
        get: {
          summary: 'Longitudinal Workplace Mental Health Trends',
          description: 'Aggregates multi-month psychosocial score trajectories bucketed by month. Enforces N >= 5 response suppression per bucket.',
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
          tags: ['HR & Compliance'],
          parameters: [
            { name: 'survey_type', in: 'query', schema: { type: 'string' }, description: 'Survey type filter (phq9, gad7, copsoq3, all)' },
            { name: 'months', in: 'query', schema: { type: 'integer', default: 6 }, description: 'Number of past months to aggregate (1-24)' },
            { name: 'department', in: 'query', schema: { type: 'string' }, description: 'Department filter' },
          ],
          responses: {
            200: { description: 'Monthly trend trajectories with privacy threshold status' },
          },
        },
      },
      '/billing/status': {
        get: {
          summary: 'Tenant Subscription & Billing Status',
          description: 'Returns active plan tier (Starter, Pro, Enterprise), seat utilization, trial days remaining, and feature entitlements.',
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
          tags: ['Billing & Subscriptions'],
          responses: {
            200: { description: 'Current subscription and available upgrade tiers' },
          },
        },
      },
      '/billing/create-checkout-session': {
        post: {
          summary: 'Create Stripe Checkout Session',
          description: 'Generates a Stripe hosted checkout URL for plan upgrade or seat expansion.',
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
          tags: ['Billing & Subscriptions'],
          responses: {
            200: { description: 'Checkout session created with redirect URL' },
            503: { description: 'Stripe payments not configured in current environment' },
          },
        },
      },
      '/billing/portal': {
        get: {
          summary: 'Access Stripe Customer Portal',
          description: 'Creates a Stripe billing portal link for subscription self-service and invoice management.',
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
          tags: ['Billing & Subscriptions'],
          responses: {
            200: { description: 'Portal session redirect URL' },
            400: { description: 'No active Stripe customer found' },
          },
        },
      },
      '/learn/categories': {
        get: {
          summary: 'List Psychoeducation Categories',
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
          tags: ['Mental Health Library'],
          responses: {
            200: { description: 'Active topic categories and article counts' },
          },
        },
      },
      '/learn/recommended': {
        get: {
          summary: 'Personalized Wellbeing Resources',
          description: 'Surfaces tailored articles driven by recent survey scores (PSS-10, PHQ-9, GAD-7, COPSOQ III) and pins crisis hotlines.',
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
          tags: ['Mental Health Library'],
          responses: {
            200: { description: 'Tailored recommended guides and emergency contacts' },
          },
        },
      },
      '/learn/articles/{slug}': {
        get: {
          summary: 'Retrieve Full Mental Health Guide',
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
          tags: ['Mental Health Library'],
          parameters: [
            { name: 'slug', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Full article markdown content and citations' },
            404: { description: 'Article not found' },
          },
        },
      },
    },
  },
  apis: [],
};

const swaggerSpec = swaggerJsdoc(options);
module.exports = swaggerSpec;
