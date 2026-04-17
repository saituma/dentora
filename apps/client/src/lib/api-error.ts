type AuthOperation = "signup" | "login" | "generic";

interface FriendlyErrorOptions {
  operation?: AuthOperation;
}

interface ExtractedFailure {
  code?: string;
  message?: string;
  httpStatus?: number;
  /** RTK Query: status is FETCH_ERROR, PARSING_ERROR, etc. */
  rtkStatus?: string | number;
  /** RTK Query network / abort message */
  fetchError?: string;
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function assignFromErrorBody(
  body: Record<string, unknown>,
  out: ExtractedFailure
): void {
  const err = body.error;
  if (typeof err === "string") {
    out.message = err;
    return;
  }
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.code === "string") out.code = e.code;
    if (typeof e.message === "string") out.message = e.message;
    return;
  }
  if (typeof body.message === "string") {
    out.message = body.message;
  }
}

function consumeResponseBody(data: unknown, out: ExtractedFailure): void {
  if (data == null) return;

  if (typeof data === "object") {
    assignFromErrorBody(data as Record<string, unknown>, out);
    return;
  }

  if (typeof data !== "string") return;

  const trimmed = data.trim();
  if (trimmed.startsWith("<")) {
    return;
  }

  const parsed = parseJsonObject(trimmed);
  if (parsed) {
    assignFromErrorBody(parsed, out);
    return;
  }

  if (trimmed.length > 0 && trimmed.length <= 500) {
    out.message = trimmed;
  }
}

function extractFailure(raw: unknown): ExtractedFailure {
  if (raw == null || typeof raw !== "object") {
    return {};
  }

  const obj = raw as Record<string, unknown>;

  // RTK Query FetchBaseQueryError
  if ("status" in obj) {
    const status = obj.status;
    const rtkStatus: string | number | undefined =
      typeof status === "number" || typeof status === "string" ? status : undefined;
    const out: ExtractedFailure = {
      rtkStatus,
      httpStatus: typeof status === "number" ? status : undefined,
    };

    consumeResponseBody(obj.data, out);

    const topError = obj.error;
    if (typeof topError === "string" && topError.length > 0) {
      if (!out.message) {
        out.fetchError = topError;
      }
    }

    return out;
  }

  // Already a JSON body shape (e.g. passed through)
  const out: ExtractedFailure = {};
  assignFromErrorBody(obj, out);
  return out;
}

function friendlyFetchErrorMessage(fetchError: string): string {
  const lower = fetchError.toLowerCase();
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed")
  ) {
    return "We couldn’t reach the server. Check your connection and try again.";
  }
  if (lower.includes("aborted")) {
    return "The request was cancelled.";
  }
  return fetchError;
}

function friendlyHttpStatusMessage(
  status: number,
  operation: AuthOperation | undefined
): string | null {
  switch (status) {
    case 400:
      return "This request couldn’t be completed. Check the information you entered.";
    case 401:
      return operation === "login"
        ? "Invalid email or password."
        : "Please sign in to continue.";
    case 403:
      return "You don’t have permission to do that.";
    case 404:
      return "We couldn’t find what you were looking for.";
    case 409:
      return operation === "signup"
        ? "This email is already registered. Try signing in instead."
        : "That action conflicts with existing data. Try refreshing the page.";
    case 422:
      return "Please check your details and try again.";
    case 429:
      return "Too many attempts. Please wait a moment and try again.";
    case 500:
    case 502:
    case 503:
    case 504:
      return "Something went wrong on our side. Please try again in a few moments.";
    default:
      if (status >= 500) {
        return "Something went wrong on our side. Please try again in a few moments.";
      }
      return null;
  }
}

export function getUserFriendlyApiError(
  rawError: unknown,
  options: FriendlyErrorOptions = {}
): string {
  const { code, message: serverMessage, httpStatus, rtkStatus, fetchError } =
    extractFailure(rawError);

  if (rtkStatus === "FETCH_ERROR" || rtkStatus === "TIMEOUT_ERROR") {
    return fetchError
      ? friendlyFetchErrorMessage(fetchError)
      : "We couldn’t reach the server. Check your connection and try again.";
  }

  if (rtkStatus === "PARSING_ERROR") {
    return serverMessage?.trim()
      ? serverMessage
      : "We got an unexpected response from the server. Please try again.";
  }

  if (code === "CONFLICT" && options.operation === "signup") {
    return "This email is already registered. Try signing in instead.";
  }

  if (code === "AUTHENTICATION_REQUIRED" && options.operation !== "login") {
    return "Your session has expired. Please sign in again.";
  }

  if (code === "FORBIDDEN") {
    if (serverMessage?.trim()) {
      // fall through — e.g. tenant suspended with specific text
    } else {
      return "Your session has expired. Please sign in again.";
    }
  }

  if (code === "VALIDATION_ERROR") {
    return serverMessage || "Please check your details and try again.";
  }

  if (code === "PROVIDER_ERROR" && serverMessage) {
    if (serverMessage.includes("detected_unusual_activity")) {
      return "ElevenLabs is blocking voice generation for this account. Voice listing may still work, but previews require an account/key that ElevenLabs allows for TTS requests.";
    }

    return serverMessage;
  }

  if (options.operation === "login" && !serverMessage) {
    return "Invalid email or password.";
  }

  if (serverMessage?.trim()) {
    return serverMessage.trim();
  }

  if (fetchError?.trim()) {
    return friendlyFetchErrorMessage(fetchError.trim());
  }

  if (httpStatus != null) {
    const fromStatus = friendlyHttpStatusMessage(httpStatus, options.operation);
    if (fromStatus) {
      return fromStatus;
    }
    return `The server returned an error (${httpStatus}). Please try again.`;
  }

  return "Something went wrong. Please try again.";
}
