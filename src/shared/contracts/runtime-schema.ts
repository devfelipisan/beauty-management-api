export interface ValidationIssue {
  path: string;
  message: string;
}

export class ContractValidationError extends Error {
  readonly code = "VALIDATION_ERROR";

  constructor(public readonly issues: ValidationIssue[]) {
    super("Request payload does not match the expected contract.");
    this.name = "ContractValidationError";
  }
}

export interface RuntimeSchema<T> {
  parse(value: unknown, path?: string): T;
}

function fail(path: string, message: string): never {
  throw new ContractValidationError([{ path, message }]);
}

function prefixIssues(error: unknown, prefix: string): never {
  if (!(error instanceof ContractValidationError)) throw error;
  throw new ContractValidationError(
    error.issues.map((issue) => ({
      ...issue,
      path: issue.path === "$" ? prefix : `${prefix}${issue.path.slice(1)}`,
    })),
  );
}

export function stringSchema(options: { min?: number; max?: number; trim?: boolean } = {}): RuntimeSchema<string> {
  return {
    parse(value, path = "$") {
      if (typeof value !== "string") return fail(path, "Expected a string.");
      const output = options.trim ? value.trim() : value;
      if (options.min !== undefined && output.length < options.min) return fail(path, `Must contain at least ${options.min} characters.`);
      if (options.max !== undefined && output.length > options.max) return fail(path, `Must contain at most ${options.max} characters.`);
      return output;
    },
  };
}

export function numberSchema(options: { integer?: boolean; min?: number; max?: number } = {}): RuntimeSchema<number> {
  return {
    parse(value, path = "$") {
      if (typeof value !== "number" || !Number.isFinite(value)) return fail(path, "Expected a finite number.");
      if (options.integer && !Number.isSafeInteger(value)) return fail(path, "Expected an integer.");
      if (options.min !== undefined && value < options.min) return fail(path, `Must be greater than or equal to ${options.min}.`);
      if (options.max !== undefined && value > options.max) return fail(path, `Must be less than or equal to ${options.max}.`);
      return value;
    },
  };
}

export function booleanSchema(): RuntimeSchema<boolean> {
  return {
    parse(value, path = "$") {
      if (typeof value !== "boolean") return fail(path, "Expected a boolean.");
      return value;
    },
  };
}

export function enumSchema<const TValues extends readonly string[]>(values: TValues): RuntimeSchema<TValues[number]> {
  const allowed = new Set<string>(values);
  return {
    parse(value, path = "$") {
      if (typeof value !== "string" || !allowed.has(value)) return fail(path, `Expected one of: ${values.join(", ")}.`);
      return value as TValues[number];
    },
  };
}

export function optionalSchema<T>(schema: RuntimeSchema<T>): RuntimeSchema<T | undefined> {
  return {
    parse(value, path = "$") {
      if (value === undefined) return undefined;
      return schema.parse(value, path);
    },
  };
}

export function arraySchema<T>(schema: RuntimeSchema<T>, options: { min?: number; max?: number } = {}): RuntimeSchema<T[]> {
  return {
    parse(value, path = "$") {
      if (!Array.isArray(value)) return fail(path, "Expected an array.");
      if (options.min !== undefined && value.length < options.min) return fail(path, `Must contain at least ${options.min} items.`);
      if (options.max !== undefined && value.length > options.max) return fail(path, `Must contain at most ${options.max} items.`);
      return value.map((item, index) => schema.parse(item, `${path}[${index}]`));
    },
  };
}

type InferSchema<TSchema> = TSchema extends RuntimeSchema<infer T> ? T : never;
type ObjectShape = Record<string, RuntimeSchema<unknown>>;
type InferObject<TShape extends ObjectShape> = { [K in keyof TShape]: InferSchema<TShape[K]> };

export function objectSchema<TShape extends ObjectShape>(shape: TShape, options: { strict?: boolean } = { strict: true }): RuntimeSchema<InferObject<TShape>> {
  return {
    parse(value, path = "$") {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return fail(path, "Expected an object.");
      const input = value as Record<string, unknown>;
      if (options.strict !== false) {
        const unexpected = Object.keys(input).filter((key) => !(key in shape));
        if (unexpected.length > 0) return fail(path, `Unexpected fields: ${unexpected.join(", ")}.`);
      }

      const output: Record<string, unknown> = {};
      const issues: ValidationIssue[] = [];
      for (const [key, schema] of Object.entries(shape)) {
        try {
          output[key] = schema.parse(input[key], `${path}.${key}`);
        } catch (error) {
          if (!(error instanceof ContractValidationError)) throw error;
          issues.push(...error.issues);
        }
      }
      if (issues.length > 0) throw new ContractValidationError(issues);
      return output as InferObject<TShape>;
    },
  };
}

export function nullableSchema<T>(schema: RuntimeSchema<T>): RuntimeSchema<T | null> {
  return {
    parse(value, path = "$") {
      if (value === null) return null;
      try {
        return schema.parse(value, path);
      } catch (error) {
        return prefixIssues(error, path);
      }
    },
  };
}
