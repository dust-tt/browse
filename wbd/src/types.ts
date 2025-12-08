import { Dump, Go, Interact } from "@browse/common/types";

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

export function isDumpInput(params: any): params is Dump["options"] {
  return (
    typeof params === "object" &&
    "html" in params &&
    typeof params.html === "boolean"
  );
}

export function isGoInput(params: any): params is Go["options"] {
  return (
    typeof params === "object" &&
    "url" in params &&
    typeof params.url === "string"
  );
}

export function isInteractInput(params: any): params is Interact["options"] {
  return (
    typeof params === "object" &&
    "instructions" in params &&
    typeof params.instructions === "string"
  );
}
