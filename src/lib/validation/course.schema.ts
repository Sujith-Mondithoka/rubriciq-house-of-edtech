import { z } from "zod";

export const COURSE_NAME_MAX = 120;
export const COURSE_DESCRIPTION_MAX = 1000;

/** Join codes avoid look-alike characters (0/O, 1/I/L). */
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const JOIN_CODE_LENGTH = 8;

export const courseIdSchema = z.uuid("Invalid course id");

const name = z
  .string()
  .trim()
  .min(1, "Enter a course name")
  .max(COURSE_NAME_MAX, `Use at most ${COURSE_NAME_MAX} characters`);

const description = z
  .string()
  .trim()
  .max(COURSE_DESCRIPTION_MAX, `Use at most ${COURSE_DESCRIPTION_MAX} characters`);

export const createCourseSchema = z.object({ name, description }).strict();

export const updateCourseSchema = z
  .object({ courseId: courseIdSchema, name, description })
  .strict();

export const courseRefSchema = z.object({ courseId: courseIdSchema }).strict();

export const setCourseAiSchema = z
  .object({ courseId: courseIdSchema, aiEnabled: z.boolean() })
  .strict();

/** Accepts "demo-2026", " demo 2026 " etc.; spaces and dashes are ignored. */
export const joinCodeSchema = z
  .string()
  .transform((value) => value.replace(/[\s-]/g, "").toUpperCase())
  .pipe(
    z
      .string()
      .min(1, "Enter a join code")
      .regex(/^[A-Z0-9]{4,12}$/, "Join codes are 4–12 letters and numbers"),
  );

export const joinCourseSchema = z.object({ joinCode: joinCodeSchema }).strict();

export const addTaSchema = z
  .object({
    courseId: courseIdSchema,
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254, "Email is too long")
      .pipe(z.email("Enter a valid email address")),
  })
  .strict();

export const removeMemberSchema = z.object({ memberId: z.uuid("Invalid member id") }).strict();

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type JoinCourseInput = z.input<typeof joinCourseSchema>;
export type AddTaInput = z.infer<typeof addTaSchema>;
