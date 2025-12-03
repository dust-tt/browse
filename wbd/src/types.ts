import { Dump, Go, Interact } from "@browse/common/types";
import { Cookie } from "playwright";

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

export function isCookieInput(params: any): params is { cookies: Cookie[] } {
  /*
  Cookie {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict"|"Lax"|"None";
    partitionKey?: string;
  }
  */
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
