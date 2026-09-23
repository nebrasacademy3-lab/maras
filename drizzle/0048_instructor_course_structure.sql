ALTER TABLE "instructor_assignments" ADD COLUMN "structure_imported_at" text;
--> statement-breakpoint
ALTER TABLE "instructor_units" ADD COLUMN "source_unit_id" integer;
--> statement-breakpoint
ALTER TABLE "instructor_lessons" ADD COLUMN "source_lesson_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "instructor_units_source_unique" ON "instructor_units" ("assignment_id", "source_unit_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "instructor_lessons_source_unique" ON "instructor_lessons" ("unit_id", "source_lesson_id");
