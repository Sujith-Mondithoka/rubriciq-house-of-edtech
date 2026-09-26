type AuthClientError = { status?: number; code?: string; message?: string } | null | undefined;

/** Turns a Better Auth client error into a message that is safe and useful to show. */
export function authErrorMessage(error: AuthClientError): string {
  if (!error) return "Something went wrong. Please try again.";
  if (error.status === 429) return "Too many attempts. Please wait a minute and try again.";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "Email or password is incorrect.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "An account with this email already exists. Try signing in.";
    case "PASSWORD_TOO_SHORT":
      return "Password is too short.";
    case "PASSWORD_TOO_LONG":
      return "Password is too long.";
  }
  // Validation messages from our own sign-up hook are written for users.
  if (error.status === 400 && error.message) return error.message;
  return "Something went wrong. Please try again.";
}
