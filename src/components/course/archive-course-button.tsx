"use client";

import { ArchiveIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { Button } from "@/components/ui/button";
import type { ServerAction } from "@/lib/result";

type ArchiveCourseButtonProps = {
  courseId: string;
  courseName: string;
  action: ServerAction<{ courseId: string }>;
};

export function ArchiveCourseButton({ courseId, courseName, action }: ArchiveCourseButtonProps) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="destructive" size="lg">
          <ArchiveIcon aria-hidden />
          Archive course
        </Button>
      }
      title={`Archive ${courseName}?`}
      description="The course becomes read-only for everyone and its join code stops working. Nothing is deleted, and it stays visible under Archived. This cannot be undone in this version."
      confirmLabel="Archive course"
      pendingLabel="Archiving…"
      destructive
      onConfirm={async () => {
        const result = await action({ courseId });
        if (!result.ok) {
          toast.error(result.message);
          return false;
        }
        toast.success("Course archived");
        router.push(`/courses/${courseId}`);
        return true;
      }}
    />
  );
}
