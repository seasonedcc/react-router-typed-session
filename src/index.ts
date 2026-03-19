import type { StandardSchemaV1 } from "@standard-schema/spec";

/**
 * Structural interface matching react-router's `Session`.
 * Allows using this library without a build-time dependency on react-router.
 */
export interface SessionLike {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  unset(key: string): void;
}

/**
 * Thrown when session data fails schema validation.
 * Exposes the `sessionKey` and structured `issues` for programmatic error handling.
 */
export class SessionValidationError extends Error {
  constructor(
    /** The session key that failed validation. */
    readonly sessionKey: string,
    /** The validation issues from the schema. */
    readonly issues: ReadonlyArray<StandardSchemaV1.Issue>,
  ) {
    super(
      `Session "${sessionKey}" validation failed:\n${issues.map((i) => `  - ${i.message}`).join("\n")}`,
    );
    this.name = "SessionValidationError";
  }
}

/** Type-safe wrapper around a session key. */
export interface TypedSession<T extends Record<string, unknown>> {
  /** Read a single value without validation. */
  get<K extends keyof T & string>(key: K): T[K] | undefined;
  /**
   * Read a single value with full schema validation.
   * @throws {SessionValidationError} If the session data fails validation.
   */
  strictGet<K extends keyof T & string>(key: K): T[K];
  /** Write a single value without validation. Returns the session for chaining. */
  set<K extends keyof T & string>(key: K, value: T[K]): SessionLike;
  /**
   * Validate and replace all session data.
   * @throws {SessionValidationError} If `data` fails validation.
   */
  setAll(data: T): SessionLike;
  /** Read all session data with validation. Returns `undefined` if missing or invalid. */
  getAll(): T | undefined;
  /**
   * Merge partial data with existing session data and validate the result.
   * @throws {SessionValidationError} If the merged data fails validation.
   */
  merge(data: Partial<T>): SessionLike;
  /** Remove a single key from the session data. */
  unset<K extends keyof T & string>(key: K): SessionLike;
  /** Remove the entire session key. */
  destroy(): SessionLike;
  /** Check whether the session key has any data stored. */
  isSet(): boolean;
  /** Alias for `getAll()`. Convenient for serializing in loaders. */
  toJSON(): T | undefined;
}

function validate<T>(sessionKey: string, schema: StandardSchemaV1<unknown, T>, data: unknown): T {
  const result = schema["~standard"].validate(data);
  if (result instanceof Promise) {
    throw new TypeError("Async schemas are not supported");
  }
  if (result.issues) {
    throw new SessionValidationError(sessionKey, result.issues);
  }
  return result.value;
}

/**
 * Create a type-safe session accessor for a given session key and schema.
 *
 * @param sessionKey - The key used to namespace data in the underlying session.
 * @param schema - Any Standard Schema-compatible schema (Zod, Valibot, ArkType, etc.).
 * @returns A function that accepts a `SessionLike` and returns a `TypedSession<T>`.
 *
 * @example
 * ```ts
 * const authSession = makeTypedSession("auth", z.object({
 *   userId: z.string(),
 *   role: z.enum(["admin", "user"]),
 * }));
 *
 * // In a loader or action:
 * const session = await sessionStorage.getSession(request.headers.get("Cookie"));
 * const auth = authSession(session);
 * const user = auth.getAll();
 * ```
 */
export function makeTypedSession<T extends Record<string, unknown>>(
  sessionKey: string,
  schema: StandardSchemaV1<unknown, T>,
) {
  function tryValidate(data: unknown): T | undefined {
    const result = schema["~standard"].validate(data);
    if (result instanceof Promise) {
      throw new TypeError("Async schemas are not supported");
    }
    if (result.issues) return undefined;
    return result.value;
  }

  return (session: SessionLike): TypedSession<T> => ({
    get<K extends keyof T & string>(key: K): T[K] | undefined {
      const data = session.get(sessionKey) as Record<string, unknown> | undefined;
      return data?.[key] as T[K] | undefined;
    },

    strictGet<K extends keyof T & string>(key: K): T[K] {
      const data = session.get(sessionKey) as Record<string, unknown> | undefined;
      return validate(sessionKey, schema, data ?? {})[key];
    },

    set<K extends keyof T & string>(key: K, value: T[K]): SessionLike {
      const data = (session.get(sessionKey) as Record<string, unknown> | undefined) ?? {};
      session.set(sessionKey, { ...data, [key]: value });
      return session;
    },

    setAll(data: T): SessionLike {
      session.set(sessionKey, validate(sessionKey, schema, data));
      return session;
    },

    getAll(): T | undefined {
      const data = session.get(sessionKey);
      if (data === undefined) return undefined;
      return tryValidate(data);
    },

    merge(data: Partial<T>): SessionLike {
      const existing = (session.get(sessionKey) as Record<string, unknown> | undefined) ?? {};
      session.set(sessionKey, validate(sessionKey, schema, { ...existing, ...data }));
      return session;
    },

    unset<K extends keyof T & string>(key: K): SessionLike {
      const data = (session.get(sessionKey) as Record<string, unknown> | undefined) ?? {};
      const { [key]: _, ...rest } = data;
      session.set(sessionKey, rest);
      return session;
    },

    destroy(): SessionLike {
      session.unset(sessionKey);
      return session;
    },

    isSet(): boolean {
      return session.get(sessionKey) !== undefined;
    },

    toJSON(): T | undefined {
      return this.getAll();
    },
  });
}
