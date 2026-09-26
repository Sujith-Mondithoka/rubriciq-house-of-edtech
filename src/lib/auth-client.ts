import { createAuthClient } from "better-auth/react";

// Same-origin: the browser calls /api/auth on whichever deployment it is on.
export const authClient = createAuthClient();
