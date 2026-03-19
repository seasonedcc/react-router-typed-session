# react-router-typed-session

Type-safe sessions for React Router. Validate with any schema library, get full autocomplete and type errors at compile time.

## Features

🛡️ Schema-validated reads and writes — catch invalid session data before it reaches your app, not with a runtime crash in production.

🔮 Fully typed accessors — autocomplete for keys, inferred value types, and compile-time errors for typos or wrong types.

🔌 Works with any [Standard Schema](https://standardschema.dev/) library — Zod, Valibot, ArkType, and more.

🗂️ Multiple typed sessions on one cookie — namespace different concerns (`auth`, `location`, `preferences`) on a single session storage.

🎯 Structured error handling — `SessionValidationError` gives you the session key and schema issues, not just a string to parse.

🔗 Chainable mutations — `set`, `setAll`, `merge`, `destroy` return the session, so you can pass it straight to `commitSession`.

🪶 Zero runtime dependencies.

## Install

```bash
npm install react-router-typed-session
```

## The problem

React Router sessions are untyped. Every `session.get()` returns `unknown`, and `session.set()` accepts anything:

```typescript
// Without react-router-typed-session:
const userId = session.get("userId");
//    ^? unknown — you have to cast manually

session.set("userId", 123);
// No error — you accidentally stored a number instead of a string

session.set("userID", "abc");
// No error — typo in the key, silently writes to the wrong slot

const role = session.get("role") as "admin" | "user";
// Compiles fine even if "role" was never set — crashes at runtime
```

## The solution

Define your session shape once with a schema. Get type safety everywhere:

```typescript
import { makeTypedSession } from "react-router-typed-session";
import { z } from "zod";

const authSession = makeTypedSession(
  "auth",
  z.object({
    userId: z.string(),
    role: z.enum(["admin", "user"]),
  }),
);

// In a loader or action:
const session = await sessionStorage.getSession(request.headers.get("Cookie"));
const auth = authSession(session);

auth.get("userId");
//   ^? string | undefined — correct type, no casting

auth.get("userID");
//       ~~~~~~~ — Type error: "userID" is not a valid key

auth.set("userId", 123);
//                 ~~~ — Type error: number is not assignable to string

auth.set("role", "admin");
//   ^? SessionLike — returns the session for chaining

const data = auth.getAll();
//    ^? { userId: string; role: "admin" | "user" } | undefined
```

## Usage

### Reading session data in a loader

```typescript
export async function loader({ request }: Route.LoaderArgs) {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  const auth = authSession(session);

  if (!auth.isSet()) throw redirect("/login");

  return { user: auth.getAll()! };
  //              ^? { userId: string; role: "admin" | "user" }
}
```

### Writing session data in an action

```typescript
export async function action({ request }: Route.ActionArgs) {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  const auth = authSession(session);

  // setAll validates against the schema before writing
  auth.setAll({ userId: "123", role: "admin" });

  return redirect("/dashboard", {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
    },
  });
}
```

### Partial updates with merge

Update some fields without touching the rest:

```typescript
auth.merge({ role: "admin" });
// keeps userId intact, validates the merged result
```

### Validated reads with strictGet

`get` reads raw data without validation (fast, for trusted reads). `strictGet` validates the entire session first — use it when you need guarantees:

```typescript
const role = auth.strictGet("role");
//    ^? "admin" | "user" — guaranteed valid, throws if not
```

### Destroying a session

```typescript
auth.destroy();
// removes the session key — auth.isSet() is now false

return redirect("/login", {
  headers: {
    "Set-Cookie": await sessionStorage.commitSession(session),
  },
});
```

## Multiple typed sessions on one cookie

Namespace different concerns on a single session storage. Each typed session only touches its own key:

```typescript
const authSession = makeTypedSession(
  "auth",
  z.object({ userId: z.string(), role: z.enum(["admin", "user"]) }),
);

const locationSession = makeTypedSession(
  "location",
  z.object({ lat: z.number(), lng: z.number(), city: z.string() }),
);

// Both operate on the same underlying session
const auth = authSession(session);
const location = locationSession(session);

auth.get("userId"); // ^? string | undefined
location.get("lat"); // ^? number | undefined
// Each is fully typed to its own schema
```

## Error handling

Methods that validate (`strictGet`, `setAll`, `merge`) throw `SessionValidationError` with structured data — no string parsing needed:

```typescript
import { SessionValidationError } from "react-router-typed-session";

try {
  auth.setAll({ userId: 123 as any, role: "invalid" });
} catch (error) {
  if (error instanceof SessionValidationError) {
    error.sessionKey; // "auth" — which session failed
    error.issues; // [{ message: "Expected string, received number" }, ...]
    error.message; // 'Session "auth" validation failed:\n  - Expected string, ...'
  }
}
```

`getAll` and `toJSON` return `undefined` instead of throwing — use them when missing/invalid data is expected:

```typescript
const data = auth.getAll();
if (!data) throw redirect("/login");
// data is fully typed from here
```

## Schema libraries

Works with any library implementing the [Standard Schema](https://standardschema.dev/) spec:

```typescript
// Zod
import { z } from "zod";
const schema = z.object({ userId: z.string(), role: z.enum(["admin", "user"]) });

// Valibot
import * as v from "valibot";
const schema = v.object({ userId: v.string(), role: v.picklist(["admin", "user"]) });

// ArkType
import { type } from "arktype";
const schema = type({ userId: "string", role: "'admin' | 'user'" });
```

## API reference

### `makeTypedSession(sessionKey, schema)`

Returns a function `(session: SessionLike) => TypedSession<T>`.

- **sessionKey** — the key used to namespace data in the underlying session
- **schema** — any Standard Schema-compatible schema

### `TypedSession<T>`

| Method            | Returns             | Validates | Throws                   |
| ----------------- | ------------------- | --------- | ------------------------ |
| `get(key)`        | `T[K] \| undefined` | No        | No                       |
| `strictGet(key)`  | `T[K]`              | Yes       | `SessionValidationError` |
| `set(key, value)` | `SessionLike`       | No        | No                       |
| `setAll(data)`    | `SessionLike`       | Yes       | `SessionValidationError` |
| `getAll()`        | `T \| undefined`    | Yes       | No                       |
| `merge(data)`     | `SessionLike`       | Yes       | `SessionValidationError` |
| `unset(key)`      | `SessionLike`       | No        | No                       |
| `destroy()`       | `SessionLike`       | No        | No                       |
| `isSet()`         | `boolean`           | No        | No                       |
| `toJSON()`        | `T \| undefined`    | Yes       | No                       |

### `SessionValidationError`

Thrown by `strictGet`, `setAll`, and `merge` when data fails schema validation. Extends `Error`.

| Property     | Type                                 | Description                        |
| ------------ | ------------------------------------ | ---------------------------------- |
| `sessionKey` | `string`                             | The session key that failed.       |
| `issues`     | `ReadonlyArray<{ message: string }>` | Structured issues from the schema. |

### `SessionLike`

A structural interface matching react-router's `Session`. No build-time dependency on react-router required:

```typescript
interface SessionLike {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  unset(key: string): void;
}
```
