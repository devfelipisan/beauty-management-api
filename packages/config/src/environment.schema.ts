import Joi from 'joi';

export const environmentSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  APP_ENV: Joi.string()
    .valid('local', 'test', 'development', 'staging', 'production')
    .required(),
  // Optional at the shared foundation level: Workers without a database
  // binding (such as liveness-only workers) must still be able to boot.
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .optional(),
  PORT: Joi.number().port().default(3000),
  SERVICE_ID: Joi.string().required(),
  SERVICE_VERSION: Joi.string().default('local'),
  AUTH_PROVIDER: Joi.string().valid('mock', 'jwt').default('mock'),
  AUTH_ISSUER: Joi.string()
    .uri({ scheme: ['https'] })
    .optional(),
  AUTH_AUDIENCE: Joi.string().optional(),
  AUTH_JWKS_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .optional(),
  AUTH_ALGORITHM: Joi.string().valid('ES256', 'RS256').optional(),
  OBSERVE_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  OBSERVE_APP_KEY: Joi.string().allow('').optional(),
  OBSERVE_APP_SECRET: Joi.string().allow('').optional(),
  OBSERVE_ENDPOINT: Joi.string()
    .uri()
    .default('https://observe-api.nestjs.com'),
  OBSERVE_TRACE_SAMPLE_RATE: Joi.number().min(0).max(1).default(1),
  OBSERVE_DEBUG: Joi.boolean().truthy('true').falsy('false').default(false),
  OBSERVE_FORWARD_LOGS: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(true),
  OBSERVE_RUNTIME_METRICS: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(true),
  OBSERVE_RUNTIME_METRICS_INTERVAL: Joi.number()
    .integer()
    .positive()
    .default(60000),
  OBSERVE_MAX_TRACES_PER_BATCH: Joi.number().integer().positive().default(1000),
  OBSERVE_FLUSH_INTERVAL: Joi.number().integer().positive().default(5000),
})
  .custom((value, helpers) => {
    if (
      value.AUTH_PROVIDER === 'jwt' &&
      (!value.AUTH_ISSUER ||
        !value.AUTH_AUDIENCE ||
        !value.AUTH_JWKS_URL ||
        !value.AUTH_ALGORITHM)
    ) {
      return helpers.error('any.custom', {
        message: 'JWT issuer, audience, JWKS URL and algorithm are required',
      });
    }
    if (
      value.OBSERVE_ENABLED &&
      (!value.OBSERVE_APP_KEY || !value.OBSERVE_APP_SECRET)
    ) {
      return helpers.error('any.custom', {
        message:
          'OBSERVE_APP_KEY and OBSERVE_APP_SECRET are required when OBSERVE_ENABLED=true',
      });
    }
    if (value.APP_ENV === 'production' && !value.OBSERVE_ENABLED) {
      return helpers.error('any.custom', {
        message: 'OBSERVE_ENABLED must be true in production',
      });
    }
    if (
      (value.NODE_ENV === 'production' ||
        !['local', 'test'].includes(value.APP_ENV)) &&
      value.AUTH_PROVIDER === 'mock'
    ) {
      return helpers.error('any.custom', {
        message: 'AUTH_PROVIDER=mock is not allowed in production',
      });
    }
    return value;
  })
  .messages({ 'any.custom': '{{#message}}' });
