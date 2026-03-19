---
description: Generate code examples and usage patterns for react-router-typed-session. Use when working with typed sessions in React Router, when code imports from "react-router-typed-session", or when user asks about type-safe sessions, makeTypedSession, SessionLike, or TypedSession.
---

# react-router-typed-session

Type-safe sessions for React Router. Schema-agnostic via Standard Schema.

## API

### `makeTypedSession(sessionKey, schema)`

Creates a typed session factory. The `sessionKey` is the key used to namespace data in the underlying session. The `schema` is any Standard Schema-compatible schema (Zod, Valibot, ArkType, etc.).

Returns a curried function: `(session: SessionLike) => TypedSession<T>`.

```typescript
import { makeTypedSession } from "react-router-typed-session";
import { z } from "zod";

const authSchema = z.object({
  userId: z.string(),
  role: z.enum(["admin", "user"]),
});

const authSession = makeTypedSession("auth", authSchema);
```

### `TypedSession<T>` methods

| Method            | Returns             | Validates | Throws |
| ----------------- | ------------------- | --------- | ------ |
| `get(key)`        | `T[K] \| undefined` | No        | No     |
| `strictGet(key)`  | `T[K]`              | Yes       | Yes    |
| `set(key, value)` | `SessionLike`       | No        | No     |
| `setAll(data)`    | `SessionLike`       | Yes       | Yes    |
| `getAll()`        | `T \| undefined`    | Yes       | No     |
| `merge(data)`     | `SessionLike`       | Yes       | Yes    |
| `unset(key)`      | `SessionLike`       | No        | No     |
| `destroy()`       | `SessionLike`       | No        | No     |
| `isSet()`         | `boolean`           | No        | No     |
| `toJSON()`        | `T \| undefined`    | Yes       | No     |

Key distinctions:

- `get` reads raw data without validation. `strictGet` validates the entire session data first.
- `getAll` and `toJSON` return `undefined` on validation failure instead of throwing.
- `toJSON` is an alias for `getAll` — convenient for serializing directly in loaders.
- `set` writes a single key without validation. `setAll` validates before writing.
- `merge` accepts `Partial<T>`, merges with existing data, then validates the result.
- Mutating methods (`set`, `setAll`, `merge`, `unset`, `destroy`) return the underlying `SessionLike` for chaining with `commitSession`.
- Methods that throw (`strictGet`, `setAll`, `merge`) throw `SessionValidationError`.

### `SessionValidationError`

Thrown by `strictGet`, `setAll`, and `merge`. Extends `Error`.

```typescript
import { SessionValidationError } from "react-router-typed-session";

try {
  auth.strictGet("role");
} catch (error) {
  if (error instanceof SessionValidationError) {
    error.sessionKey; // "auth"
    error.issues; // [{ message: "Expected string, ..." }]
  }
}
```

Properties:

- `sessionKey: string` — the session key that failed validation
- `issues: ReadonlyArray<{ message: string }>` — structured issues from the schema

### `SessionLike` interface

A structural interface — no build-time dependency on react-router:

```typescript
interface SessionLike {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  unset(key: string): void;
}
```

React Router's `Session` satisfies this interface.

## Patterns

### Loader: protect route and read session

```typescript
export async function loader({ request }: Route.LoaderArgs) {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  const auth = authSession(session);

  if (!auth.isSet()) throw redirect("/login");

  return { user: auth.getAll()! };
}
```

### Action: write session and commit

```typescript
export async function action({ request }: Route.ActionArgs) {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  const auth = authSession(session);

  auth.setAll({ userId: "123", role: "admin" });

  return redirect("/dashboard", {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
}
```

### Multiple typed sessions on one cookie

```typescript
const authSession = makeTypedSession("auth", authSchema);
const locationSession = makeTypedSession("location", locationSchema);

// In a loader:
const auth = authSession(session);
const location = locationSession(session);
```

### Partial updates with merge

```typescript
const auth = authSession(session);
auth.merge({ role: "admin" }); // keeps userId intact
```

### Destroy session (logout)

```typescript
const auth = authSession(session);
auth.destroy();
return redirect("/login", {
  headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
});
```

### Chaining set calls with commitSession

`set`, `setAll`, `merge`, `unset`, and `destroy` return the underlying `SessionLike`, so you can pass the result directly:

```typescript
const auth = authSession(session);
// auth.setAll returns the session
await sessionStorage.commitSession(auth.setAll({ userId: "123", role: "user" }) as Session);
```

### Schema libraries

Any Standard Schema-compatible library works:

```typescript
// Zod
const schema = z.object({ name: z.string() });

// Valibot
const schema = v.object({ name: v.string() });

// ArkType
const schema = type({ name: "string" });
```

## Important constraints

- Only synchronous schemas are supported. Async schemas throw `TypeError`.
- `get` and `set` do NOT validate — they read/write raw data. Use `strictGet`/`setAll`/`getAll`/`merge` for validated access.
- Validation errors throw `SessionValidationError` (extends `Error`) with `sessionKey` and `issues` properties.
- `getAll` and `toJSON` silently return `undefined` on validation failure (do not throw).
