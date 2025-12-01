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
  "newTab",
  "closeTab",
  "dump",
  "go",
  "interact",
  "deleteSession",
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
