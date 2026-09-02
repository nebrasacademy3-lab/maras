CREATE TABLE "learning_tracks" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'skills' NOT NULL,
	"icon_key" text DEFAULT 'sparkles' NOT NULL,
	"accent" text DEFAULT 'blue' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"cta_label" text DEFAULT 'أبلغني عند الإطلاق' NOT NULL,
	"destination" text,
	"position" integer DEFAULT 0 NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"show_interest_count" boolean DEFAULT false NOT NULL,
	"release_version" integer DEFAULT 0 NOT NULL,
	"launch_at" text,
	"created_by" text,
	"updated_by" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "learning_tracks_slug_check" CHECK ("slug" ~ '^[a-z0-9][a-z0-9._-]{1,119}$'),
	CONSTRAINT "learning_tracks_title_check" CHECK (char_length(btrim("title")) BETWEEN 2 AND 120),
	CONSTRAINT "learning_tracks_subtitle_check" CHECK (char_length("subtitle") <= 180),
	CONSTRAINT "learning_tracks_description_check" CHECK (char_length("description") <= 1000),
	CONSTRAINT "learning_tracks_category_check" CHECK ("category" IN ('english', 'training', 'foundation', 'university', 'career', 'exam', 'skills')),
	CONSTRAINT "learning_tracks_icon_check" CHECK ("icon_key" IN ('languages', 'briefcase', 'calculator', 'presentation', 'rocket', 'target', 'sparkles')),
	CONSTRAINT "learning_tracks_accent_check" CHECK ("accent" IN ('blue', 'violet', 'emerald', 'amber', 'rose', 'cyan')),
	CONSTRAINT "learning_tracks_status_check" CHECK ("status" IN ('draft', 'coming_soon', 'enrollment_open', 'available', 'archived')),
	CONSTRAINT "learning_tracks_cta_check" CHECK (char_length(btrim("cta_label")) BETWEEN 2 AND 60),
	CONSTRAINT "learning_tracks_destination_check" CHECK ("destination" IS NULL OR ("destination" ~ '^/[A-Za-z0-9/_?=&%#.-]*$' AND "destination" NOT LIKE '//%' AND "destination" !~ '(^|/)\.\.(/|$)')),
	CONSTRAINT "learning_tracks_position_check" CHECK ("position" >= 0),
	CONSTRAINT "learning_tracks_release_version_check" CHECK ("release_version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "learning_track_interests" (
	"id" serial PRIMARY KEY NOT NULL,
	"track_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text DEFAULT 'homepage' NOT NULL,
	"last_notified_version" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "learning_track_interests_status_check" CHECK ("status" IN ('active', 'cancelled')),
	CONSTRAINT "learning_track_interests_source_check" CHECK ("source" ~ '^[A-Za-z0-9_-]{1,40}$'),
	CONSTRAINT "learning_track_interests_notified_version_check" CHECK ("last_notified_version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "learning_track_interests" ADD CONSTRAINT "learning_track_interests_track_id_learning_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."learning_tracks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "learning_track_interests" ADD CONSTRAINT "learning_track_interests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "learning_tracks_slug_unique" ON "learning_tracks" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "learning_tracks_public_idx" ON "learning_tracks" USING btree ("status","position","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "learning_track_interests_track_user_unique" ON "learning_track_interests" USING btree ("track_id","user_id");
--> statement-breakpoint
CREATE INDEX "learning_track_interests_track_status_idx" ON "learning_track_interests" USING btree ("track_id","status","id");
--> statement-breakpoint
CREATE INDEX "learning_track_interests_user_status_idx" ON "learning_track_interests" USING btree ("user_id","status");
--> statement-breakpoint
INSERT INTO "learning_tracks" (
	"slug", "title", "subtitle", "description", "category", "icon_key", "accent",
	"status", "cta_label", "position", "featured", "show_interest_count"
) VALUES
	('english-boost', 'تقوية الإنجليزية', 'من الأساس إلى الإنجليزية الأكاديمية', 'مسارات متدرجة للمحادثة والقواعد والمصطلحات التي يحتاجها الطالب في الجامعة.', 'english', 'languages', 'blue', 'coming_soon', 'أبلغني عند الإطلاق', 10, true, false),
	('professional-training', 'الدورات التدريبية', 'مهارات عملية تتجاوز حدود المقرر', 'دورات مختارة في الأدوات الرقمية والبرمجة وتحليل البيانات ومهارات العمل.', 'training', 'briefcase', 'violet', 'coming_soon', 'أبلغني عند الإطلاق', 20, true, false),
	('foundation-paths', 'المسارات التأسيسية', 'أساس قوي قبل المقررات المتقدمة', 'تأسيس منظم في الرياضيات والفيزياء والكيمياء والبرمجة قبل الانتقال للمستوى التالي.', 'foundation', 'calculator', 'emerald', 'coming_soon', 'أبلغني عند الإطلاق', 30, true, false),
	('university-skills', 'مهارات الجامعة', 'أدوات للدراسة والبحث والعرض', 'البحث العلمي وكتابة التقارير والعروض وإدارة الوقت بأسلوب تطبيقي واضح.', 'university', 'presentation', 'amber', 'coming_soon', 'أبلغني عند الإطلاق', 40, false, false),
	('career-ready', 'الاستعداد للعمل', 'من مقاعد الجامعة إلى أول فرصة', 'السيرة الذاتية والمقابلات والمهارات المهنية التي تساعد الطالب على دخول سوق العمل بثقة.', 'career', 'rocket', 'rose', 'coming_soon', 'أبلغني عند الإطلاق', 50, false, false),
	('exam-prep', 'الاستعداد للاختبارات', 'تدريب موجّه للهدف', 'مسارات مراجعة وتدريب للاختبارات المعيارية واللغوية عند إطلاقها.', 'exam', 'target', 'cyan', 'coming_soon', 'أبلغني عند الإطلاق', 60, false, false)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
CREATE TRIGGER sync_learning_tracks_catalog
	AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON learning_tracks
	FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_catalog_statement();
--> statement-breakpoint
CREATE TRIGGER sync_learning_track_interests_account
	AFTER INSERT OR UPDATE OR DELETE ON learning_track_interests
	FOR EACH ROW EXECUTE FUNCTION meras_sync_account_row();
--> statement-breakpoint
CREATE TRIGGER sync_learning_track_interests_catalog
	AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON learning_track_interests
	FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_catalog_statement();
--> statement-breakpoint
SELECT meras_touch_sync('catalog', '*');
