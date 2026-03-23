import type { Act, Dump, Go, Observe } from "@browse/common/types";

export function isTabInput(params: any): params is { tabName: string } {
  return typeof params === "object" && "tabName" in params;
}

export function isNewTabInput(
  params: any,
): params is { tabName: string; url: string } {
  return (
    typeof params === "object" &&
    "tabName" in params &&
    typeof params.tabName === "string" &&
    "url" in params &&
    typeof params.url === "string"
  );
}

export function isDumpInput(
  params: any,
): params is { tabName: string } & Dump["options"] {
  return (
    typeof params === "object" &&
    "tabName" in params &&
    typeof params.tabName === "string" &&
    "html" in params &&
    typeof params.html === "boolean"
  );
}

export function isGoInput(
  params: any,
): params is { tabName: string } & Go["options"] {
  return (
    typeof params === "object" &&
    "tabName" in params &&
    typeof params.tabName === "string" &&
    "url" in params &&
    typeof params.url === "string"
  );
}

export function isActInput(
  params: any,
): params is { tabName: string } & Act["options"] {
  return (
    typeof params === "object" &&
    "tabName" in params &&
    typeof params.tabName === "string" &&
    "instructions" in params &&
    typeof params.instructions === "string"
  );
}

export function isObserveInput(
  params: any,
): params is { tabName: string } & Observe["options"] {
  return (
    typeof params === "object" &&
    "tabName" in params &&
    typeof params.tabName === "string" &&
    "instructions" in params &&
    typeof params.instructions === "string"
  );
}
