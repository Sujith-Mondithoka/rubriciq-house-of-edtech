/**
 * Fixed demo accounts for reviewers. Kept separate from the seed so the sign-in
 * action does not pull seed content into the server bundle.
 */

export const DEMO_USERS = {
  instructor: {
    id: "demo-instructor",
    name: "Priya Sharma (Demo Instructor)",
    email: "instructor@rubriciq.demo",
  },
  ta: { id: "demo-ta", name: "Arjun Mehta (Demo TA)", email: "ta@rubriciq.demo" },
  student1: {
    id: "demo-student-1",
    name: "Ananya Rao (Demo Student)",
    email: "student1@rubriciq.demo",
  },
  student2: {
    id: "demo-student-2",
    name: "Rahul Verma (Demo Student)",
    email: "student2@rubriciq.demo",
  },
  student3: {
    id: "demo-student-3",
    name: "Meera Iyer (Demo Student)",
    email: "student3@rubriciq.demo",
  },
} as const;

export const DEMO_USER_IDS: string[] = Object.values(DEMO_USERS).map((u) => u.id);
export const DEMO_JOIN_CODE = "DEMO2026";

/** Public on purpose: demo accounts exist so reviewers can sign in with one click. */
export const DEMO_PASSWORD = "rubriciq-demo-2026";

/** Which demo account each "Try as …" button signs in to. */
export const DEMO_LOGINS = {
  instructor: DEMO_USERS.instructor,
  ta: DEMO_USERS.ta,
  student: DEMO_USERS.student1,
} as const;
