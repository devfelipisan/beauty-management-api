import Joi from 'joi';
export const environmentSchema = Joi.object({
  APP_ENV: Joi.string()
    .valid('local', 'test', 'development', 'staging', 'production')
    .required(),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  PORT: Joi.number().port().default(3000),
  SERVICE_ID: Joi.string().required(),
  SERVICE_VERSION: Joi.string().default('local'),
  OBSERVE_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  OBSERVE_APP_KEY: Joi.string().allow('').optional(),
  OBSERVE_APP_SECRET: Joi.string().allow('').optional(),
  OBSERVE_ENDPOINT: Joi.string()
    .uri()
    .default('https://observe-api.nestjs.com'),
  OBSERVE_TRACE_SAMPLE_RATE: Joi.number().min(0).max(1).default(0.1),
  OBSERVE_DEBUG: Joi.boolean().truthy('true').falsy('false').default(false),
})
  .custom((value, helpers) => {
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
    return value;
  })
  .messages({ 'any.custom': '{{#message}}' });
