import { err, ok, Result } from "./error";

export type Tab = {
  url: string;
  actions: Action[];
  startTime: Date;
};

export function isTab(tab: any): tab is Tab {
  return (
    typeof tab === "object" &&
    "url" in tab &&
    typeof tab.url === "string" &&
    "startTime" in tab &&
    "actions" in tab
  );
}

export function isNamedTab(tab: any): tab is Tab & { tabName: string } {
  return isTab(tab) && "tabName" in tab && typeof tab.tabName === "string";
}

export type Dump = {
  type: "dump";
  timestamp: Date;
  options: {
    html: boolean;
    offset?: number;
  };
};

export type Go = {
  type: "go";
  timestamp: Date;
  options: {
    url: string;
  };
};

export type Interact = {
  type: "interact";
  timestamp: Date;
  options: {
    instructions: string;
  };
};

export type InteractResult = {
  description: string;
  url: string;
};

export function isInteractResult(result: any): result is InteractResult {
  return (
    typeof result === "object" &&
    "description" in result &&
    typeof result.description === "string" &&
    "url" in result &&
    typeof result.url === "string"
  );
}

export interface Action {
  type: (Dump | Go | Interact)["type"];
  timestamp: Date;
  options: Record<string, any>;
}

export type Response = { result: any } | { error: string };

export function resultToResponse<T>(result: Result<T>): Response {
  if (result.isOk()) {
    return { result: result.value ?? null }; // To ensure the property is present
  } else {
    return { error: result.error.message };
  }
}

export function responseToResult<T>(response: Response): Result<T> {
  if ("result" in response) {
    return ok(response.result ?? undefined); // To change back to void/undefined
  } else {
    return err(response.error);
  }
}

export function isResponse(response: any): response is Response {
  return (
    typeof response === "object" &&
    ("result" in response ||
      ("error" in response && typeof response.error === "string"))
  );
}

export type SessionMethod = (typeof SESSION_METHODS)[number];

export const SESSION_METHODS = [
  "runtimeSeconds",
  "listTabs",
  "getCurrentTab",
  "setCurrentTab",
  "addCookies",
  "newTab",
  "closeTab",
  "dump",
  "go",
  "interact",
  "deleteSession",
  "startNetworkRecord",
  "stopNetworkRecord",
] as const;

export const SESSION_METHODS_STR = SESSION_METHODS.map((m) => `"${m}"`).join(
  " | ",
);

export function isSessionMethod(method: any): method is SessionMethod {
  return (
    typeof method === "string" &&
    SESSION_METHODS.includes(method as SessionMethod)
  );
}

export type NetworkEvent = ResponseEvent | RequestEvent;

export type ResponseEvent = {
  type: "response";
  requestId: string;
  timestamp: number;
  options: {
    url: string;
    status: number;
    headers: Record<string, string>;
    body?: string;
  };
};

export type RequestEvent = {
  type: "request";
  requestId: string;
  timestamp: number;
  options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  };
};

export function isRequestEvent(event: any): event is RequestEvent {
  return (
    typeof event === "object" &&
    "type" in event &&
    event.type === "request" &&
    "requestId" in event &&
    typeof event.requestId === "string" &&
    "timestamp" in event &&
    typeof event.timestamp === "number" &&
    "options" in event &&
    "url" in event.options &&
    typeof event.options.url === "string" &&
    "method" in event.options && typeof event.options.method === "string" &&
    "headers" in event.options && typeof event.options.headers === "object" &&
    ("body" in event.options ? typeof event.options.body === "string" : true)
  );
}

export function isResponseEvent(event: any): event is ResponseEvent {
  return (
    typeof event === "object" &&
    "type" in event &&
    event.type === "response" &&
    "requestId" in event &&
    typeof event.requestId === "string" &&
    "timestamp" in event &&
    typeof event.timestamp === "number" &&
    "options" in event &&
    "url" in event.options &&
    typeof event.options.url === "string" &&
    "status" in event.options &&
    typeof event.options.status === "number" &&
    "headers" in event.options && typeof event.options.headers === "object" &&
    ("body" in event.options ? typeof event.options.body === "string" : true)
  );
}

export function isNetworkEvent(event: any): event is NetworkEvent {
  return isRequestEvent(event) || isResponseEvent(event);
}

export type Cookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
  partitionKey?: string;
};

export function isCookieInput(params: any): params is { cookies: Cookie[] } {
  return (
    "cookies" in params &&
    Array.isArray(params.cookies) &&
    params.cookies.every(
      (cookie: any): cookie is Cookie =>
        "name" in cookie &&
        typeof cookie.name === "string" &&
        "value" in cookie &&
        typeof cookie.value === "string" &&
        "domain" in cookie &&
        typeof cookie.domain === "string" &&
        "path" in cookie &&
        typeof cookie.path === "string" &&
        "expires" in cookie &&
        typeof cookie.expires === "number" &&
        "httpOnly" in cookie &&
        typeof cookie.httpOnly === "boolean" &&
        "secure" in cookie &&
        typeof cookie.secure === "boolean" &&
        "sameSite" in cookie &&
        ["Strict", "Lax", "None"].includes(cookie.sameSite) &&
        ("partitionKey" in cookie
          ? typeof cookie.partitionKey === "string"
          : true),
    )
  );
}
