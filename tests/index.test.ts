import { describe, expect, test } from "vite-plus/test";
import { z } from "zod/mini";
import type { SessionLike, TypedSession } from "../src";
import { makeTypedSession, SessionValidationError } from "../src";

const schema = z.object({
  name: z.string(),
  email: z.string(),
});
type User = z.infer<typeof schema>;

function createMockSession(): SessionLike {
  const store = new Map<string, unknown>();
  return {
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => store.set(key, value),
    unset: (key: string) => store.delete(key),
  };
}

describe("makeTypedSession", () => {
  const userSession = makeTypedSession("user", schema);

  test("set and get individual values", () => {
    const session = createMockSession();
    const typed = userSession(session);

    typed.set("name", "Alice");
    expect(typed.get("name")).toBe("Alice");

    typed.set("email", "alice@example.com");
    expect(typed.get("email")).toBe("alice@example.com");
  });

  test("get returns undefined when key is not set", () => {
    const session = createMockSession();
    const typed = userSession(session);
    expect(typed.get("name")).toBeUndefined();
  });

  test("strictGet validates and returns value", () => {
    const session = createMockSession();
    const typed = userSession(session);

    typed.set("name", "Alice");
    typed.set("email", "alice@example.com");
    expect(typed.strictGet("name")).toBe("Alice");
  });

  test("strictGet throws on invalid data", () => {
    const session = createMockSession();
    const typed = userSession(session);

    typed.set("name", 123 as unknown as string);
    typed.set("email", "alice@example.com");

    expect(() => typed.strictGet("name")).toThrow();
  });

  test("setAll validates and replaces all data", () => {
    const session = createMockSession();
    const typed = userSession(session);

    typed.setAll({ name: "Alice", email: "alice@example.com" });

    expect(typed.get("name")).toBe("Alice");
    expect(typed.get("email")).toBe("alice@example.com");
  });

  test("setAll throws on invalid data", () => {
    const session = createMockSession();
    const typed = userSession(session);

    expect(() => typed.setAll({ name: 123 as unknown as string, email: "a@b.com" })).toThrow();
  });

  test("getAll returns parsed data", () => {
    const session = createMockSession();
    const typed = userSession(session);

    typed.setAll({ name: "Alice", email: "alice@example.com" });
    expect(typed.getAll()).toEqual({ name: "Alice", email: "alice@example.com" });
  });

  test("getAll returns undefined on validation failure", () => {
    const session = createMockSession();
    const typed = userSession(session);

    typed.set("name", 123 as unknown as string);
    expect(typed.getAll()).toBeUndefined();
  });

  test("getAll returns undefined when session key is not set", () => {
    const session = createMockSession();
    const typed = userSession(session);
    expect(typed.getAll()).toBeUndefined();
  });

  test("merge combines with existing data", () => {
    const session = createMockSession();
    const typed = userSession(session);

    typed.setAll({ name: "Alice", email: "alice@example.com" });
    typed.merge({ email: "new@example.com" });

    expect(typed.get("name")).toBe("Alice");
    expect(typed.get("email")).toBe("new@example.com");
  });

  test("unset removes session key and validates", () => {
    const session = createMockSession();
    const typed = userSession(session);

    typed.setAll({ name: "Alice", email: "alice@example.com" });
    typed.unset("name");

    expect(typed.get("name")).toBeUndefined();
    expect(typed.get("email")).toBe("alice@example.com");
  });

  test("destroy unsets the session key", () => {
    const session = createMockSession();
    const typed = userSession(session);

    typed.setAll({ name: "Alice", email: "alice@example.com" });
    typed.destroy();

    expect(typed.getAll()).toBeUndefined();
  });

  test("isSet returns true when data exists", () => {
    const session = createMockSession();
    const typed = userSession(session);

    typed.setAll({ name: "Alice", email: "alice@example.com" });
    expect(typed.isSet).toBe(true);
  });

  test("isSet returns false when no data exists", () => {
    const session = createMockSession();
    const typed = userSession(session);
    expect(typed.isSet).toBe(false);
  });

  test("throws SessionValidationError on validation failure", () => {
    const session = createMockSession();
    const typed = userSession(session);

    typed.set("name", 123 as unknown as string);
    typed.set("email", "alice@example.com");

    expect(() => typed.strictGet("name")).toThrow(SessionValidationError);
  });

  test("SessionValidationError has sessionKey and issues", () => {
    const session = createMockSession();
    const typed = userSession(session);

    typed.set("name", 123 as unknown as string);
    typed.set("email", "alice@example.com");

    try {
      typed.strictGet("name");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SessionValidationError);
      const validationError = error as SessionValidationError;
      expect(validationError.sessionKey).toBe("user");
      expect(validationError.issues).toBeInstanceOf(Array);
      expect(validationError.issues.length).toBeGreaterThan(0);
      expect(validationError.issues[0]!.message).toBeTypeOf("string");
    }
  });

  test("SessionValidationError message includes session key", () => {
    const session = createMockSession();
    const typed = userSession(session);

    typed.set("name", 123 as unknown as string);
    typed.set("email", "alice@example.com");

    expect(() => typed.strictGet("name")).toThrow(/Session "user" validation failed/);
  });

  test("SessionValidationError is instanceof Error", () => {
    const session = createMockSession();
    const typed = userSession(session);

    typed.set("name", 123 as unknown as string);
    typed.set("email", "alice@example.com");

    expect(() => typed.strictGet("name")).toThrow(Error);
  });

  test("setAll throws SessionValidationError on invalid data", () => {
    const session = createMockSession();
    const typed = userSession(session);

    expect(() => typed.setAll({ name: 123 as unknown as string, email: "a@b.com" })).toThrow(
      SessionValidationError,
    );
  });

  test("merge throws SessionValidationError on invalid result", () => {
    const session = createMockSession();
    const typed = userSession(session);

    typed.setAll({ name: "Alice", email: "alice@example.com" });
    expect(() => typed.merge({ name: 123 as unknown as string })).toThrow(SessionValidationError);
  });

  test("throws TypeError on async schema", () => {
    const asyncSchema = {
      "~standard": {
        version: 1 as const,
        vendor: "test",
        validate: (_value: unknown) => Promise.resolve({ value: {} }),
      },
    };

    const asyncSession = makeTypedSession("async", asyncSchema);
    const session = createMockSession();
    const typed = asyncSession(session);

    typed.set("key" as never, "value" as never);
    expect(() => typed.getAll()).toThrow(TypeError);
    expect(() => typed.getAll()).toThrow(/Async schemas are not supported/);
  });

  test("toJSON returns validated data", () => {
    const session = createMockSession();
    const typed = userSession(session);

    typed.setAll({ name: "Alice", email: "alice@example.com" });
    expect(typed.toJSON()).toEqual({ name: "Alice", email: "alice@example.com" });
  });

  test("toJSON returns undefined when session is not set", () => {
    const session = createMockSession();
    const typed = userSession(session);
    expect(typed.toJSON()).toBeUndefined();
  });

  test("toJSON returns undefined on invalid data", () => {
    const session = createMockSession();
    const typed = userSession(session);

    typed.set("name", 123 as unknown as string);
    expect(typed.toJSON()).toBeUndefined();
  });

  test("set returns the session for chaining", () => {
    const session = createMockSession();
    const typed = userSession(session);

    const result = typed.set("name", "Alice");
    expect(result).toBe(session);
  });

  test("setAll returns the session for chaining", () => {
    const session = createMockSession();
    const typed = userSession(session);

    const result = typed.setAll({ name: "Alice", email: "a@b.com" });
    expect(result).toBe(session);
  });
});

describe("type tests", () => {
  test("get returns T[K] | undefined", () => {
    type Session = TypedSession<User>;
    type Result = ReturnType<Session["get"]>;
    type _assert = Expect<Equal<Result, string | undefined>>;
  });

  test("strictGet returns T[K]", () => {
    type Session = TypedSession<User>;
    type _assert = Expect<Equal<ReturnType<Session["strictGet"]>, string>>;
  });

  test("set accepts correct key-value pairs", () => {
    type Session = TypedSession<User>;
    type _assert = Expect<
      Equal<Parameters<Session["set"]>, [key: "name" | "email", value: string]>
    >;
  });

  test("getAll returns T | undefined", () => {
    type Session = TypedSession<User>;
    type _assert = Expect<Equal<ReturnType<Session["getAll"]>, User | undefined>>;
  });

  test("merge accepts Partial<T>", () => {
    type Session = TypedSession<User>;
    type _assert = Expect<Equal<Parameters<Session["merge"]>, [data: Partial<User>]>>;
  });

  test("toJSON returns T | undefined", () => {
    type Session = TypedSession<User>;
    type _assert = Expect<Equal<ReturnType<Session["toJSON"]>, User | undefined>>;
  });

  test("infers output type from schema", () => {
    const session = makeTypedSession("test", schema);
    type Result = ReturnType<typeof session>;
    type _assert = Expect<Equal<Result, TypedSession<User>>>;
  });
});
