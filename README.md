# react-router-typed-session

Type-safe sessions for React Router. Schema-agnostic via [Standard Schema](https://github.com/standard-schema/standard-schema).

## Features

- Full type safety for session `get`, `set`, `merge`, `getAll`, and more
- Works with any Standard Schema-compatible library (Zod, Valibot, ArkType, etc.)
- No runtime dependency on `react-router` — uses a structural `SessionLike` interface
- Validates data with your schema on `strictGet`, `setAll`, `getAll`, and `merge`
- Lightweight — zero external dependencies in the bundle

## Install

```bash
npm install react-router-typed-session
```

## Usage

```typescript
import { makeTypedSession } from "react-router-typed-session";
import { z } from "zod";

const schema = z.object({
  userId: z.string(),
  role: z.enum(["admin", "user"]),
});

const authSession = makeTypedSession("auth", schema);

// In a loader or action:
export async function loader({ request }: LoaderFunctionArgs) {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  const auth = authSession(session);

  const data = auth.getAll();
  if (!data) throw redirect("/login");

  return { user: data };
}

export async function action({ request }: ActionFunctionArgs) {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  const auth = authSession(session);

  auth.setAll({ userId: "123", role: "admin" });

  return redirect("/dashboard", {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
    },
  });
}
```

## Schema libraries

Any library implementing the [Standard Schema](https://github.com/standard-schema/standard-schema) spec works:

```typescript
// Zod
import { z } from "zod";
const schema = z.object({ name: z.string() });

// Valibot
import * as v from "valibot";
const schema = v.object({ name: v.string() });

// ArkType
import { type } from "arktype";
const schema = type({ name: "string" });
```

## Patterns

### Protecting routes

```typescript
const auth = authSession(session);
if (!auth.isSet()) throw redirect("/login");
const user = auth.getAll()!;
```

### Multiple typed sessions on one cookie

```typescript
const authSession = makeTypedSession("auth", authSchema);
const locationSession = makeTypedSession("location", locationSchema);

// Both operate on the same underlying session storage
const auth = authSession(session);
const location = locationSession(session);
```

### Partial updates with merge

```typescript
const auth = authSession(session);
auth.merge({ role: "admin" }); // keeps other fields intact
```

### Destroying a session

```typescript
const auth = authSession(session);
auth.destroy(); // removes the session key entirely
```

## API reference

### `makeTypedSession(sessionKey, schema)`

Returns a function `(session: SessionLike) => TypedSession<T>`.

- **sessionKey** — the key used to store data in the session
- **schema** — any Standard Schema-compatible schema

### `TypedSession<T>`

| Method            | Description                                                  |
| ----------------- | ------------------------------------------------------------ |
| `get(key)`        | Get a single value. Returns `T[K] \| undefined`.             |
| `strictGet(key)`  | Get a single value with validation. Throws on invalid data.  |
| `set(key, value)` | Set a single value. Returns `SessionLike` for chaining.      |
| `setAll(data)`    | Validate and replace all session data. Throws on invalid.    |
| `getAll()`        | Get all data with validation. Returns `T \| undefined`.      |
| `merge(data)`     | Merge partial data with existing, validates the result.      |
| `unset(key)`      | Remove a single key from session data.                       |
| `destroy()`       | Remove the entire session key.                               |
| `isSet()`         | Check if the session key has any data.                       |
| `toJSON()`        | Alias for `getAll()`. Convenient for serializing in loaders. |

### `SessionValidationError`

Thrown by `strictGet`, `setAll`, and `merge` when data fails validation. Extends `Error`.

| Property     | Type                                 | Description                        |
| ------------ | ------------------------------------ | ---------------------------------- |
| `sessionKey` | `string`                             | The session key that failed.       |
| `issues`     | `ReadonlyArray<{ message: string }>` | Structured issues from the schema. |

```typescript
import { SessionValidationError } from "react-router-typed-session";

try {
  auth.strictGet("role");
} catch (error) {
  if (error instanceof SessionValidationError) {
    console.log(error.sessionKey); // "auth"
    console.log(error.issues); // [{ message: "Expected string, ..." }]
  }
}
```

### `SessionLike`

A structural interface matching react-router's `Session`:

```typescript
interface SessionLike {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  unset(key: string): void;
}
```
