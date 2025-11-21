export class Ok<T> {
  constructor(public value: T) {}

  isOk(): this is Ok<T> {
    return true;
  }

  isErr(): this is Err<never> {
    return false;
  }

  toString(): string {
    return prettyString(this.value);
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return this.toString();
  }
}

export class Err<E> {
  constructor(public error: E) {}

  isOk(): this is Ok<never> {
    return false;
  }

  isErr(): this is Err<E> {
    return true;
  }

  toString(): string {
    if (this.error && this.error instanceof BrowserError) {
      console.log("IS BrowserError");
      return `Error: ${this.error.toString()}`;
    }
    return `Error: ${JSON.stringify(this.error, null, 2)}`;
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return this.toString();
  }
}

export type Result<T, E> = Ok<T> | Err<E>;

export class BrowserError {
  constructor(public message: string) {}

  toString(): string {
    return this.message;
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return this.toString();
  }
}

export function err(message: string | Error): Err<BrowserError> {
  if (message instanceof Error) {
    return new Err(new BrowserError(message.message));
  } else {
    return new Err(new BrowserError(message));
  }
}

export function ok<T>(value: T): Ok<T> {
  return new Ok(value);
}

export function isBasicType(value: any): value is string | number | boolean {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    value === undefined
  );
}

export function prettyString(value: any): string {
  return prettyStringInternal(value).trim();
}

function prettyStringInternal(value: any, indent: number = 0): string {
  const prefix = "  ".repeat(indent);
  if (isBasicType(value)) {
    if (typeof value === "string") {
      return prefix + value;
    } else {
      return prefix + JSON.stringify(value);
    }
  }
  if (Array.isArray(value)) {
    return value.length > 0
      ? value.map((v) => prettyStringInternal(v, indent)).join("\n")
      : "";
  } else if (typeof value === "object") {
    let str = "";
    for (const key in value) {
      if (isBasicType(value[key])) {
        str += `${prefix}${key}: ${value[key]}\n`;
      } else {
        str += `${prefix}${key}:\n${prettyStringInternal(value[key], indent + 1)}\n`;
      }
    }
    return str;
  } else {
    return String(value);
  }
}
