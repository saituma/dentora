type AuthOperation = "signup" | "login" | "generic";

interface FriendlyErrorOptions {
  operation?: AuthOperation;
}

interface ServerErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
  };
  correlationId?: string;
  message?: string;
}

function toServerEnvelope(value: unknown): ServerErrorEnvelope {
  if (!value || typeof value !== "object") return {};

  const asRecord = value as Record<string, unknown>;
  const data = asRecord.data;

  if (data && typeof data === "object") {
    return data as ServerErrorEnvelope;
  }

  return asRecord as ServerErrorEnvelope;
}

export function getUserFriendlyApiError(
  rawError: unknown,
  options: FriendlyErrorOptions = {}
): string {
  const envelope = toServerEnvelope(rawError);
  const code = envelope.error?.code;
  const serverMessage = envelope.error?.message || envelope.message;

  if (code === "CONFLICT" && options.operation === "signup") {
    return "This email is already registered. Try signing in instead.";
  }

  if (code === "AUTHENTICATION_REQUIRED" || code === "FORBIDDEN") {
    return "Your session has expired. Please sign in again.";
  }

  if (code === "VALIDATION_ERROR") {
    return serverMessage || "Please check your details and try again.";
  }

  if (options.operation === "login" && !serverMessage) {
    return "Invalid email or password.";
  }

  if (serverMessage) {
    return serverMessage;
  }

  return "Something went wrong. Please try again.";
}
