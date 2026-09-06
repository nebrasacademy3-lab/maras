CREATE TABLE IF NOT EXISTS "catalog_tombstones" (
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "deleted_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  CONSTRAINT "catalog_tombstones_entity_type_entity_id_pk" PRIMARY KEY ("entity_type", "entity_id")
);
--> statement-breakpoint
-- Preserve historical deletions only when no record has since been recreated.
INSERT INTO "catalog_tombstones" ("entity_type", "entity_id", "deleted_at")
SELECT a.entity_type, a.entity_id, max(a.created_at)
FROM audit_logs a
WHERE a.action = 'delete' AND a.entity_id IS NOT NULL
AND (
  (a.entity_type = 'course' AND NOT EXISTS (SELECT 1 FROM catalog_courses c WHERE c.slug = a.entity_id)) OR
  (a.entity_type = 'institution' AND NOT EXISTS (SELECT 1 FROM catalog_institutions i WHERE i.slug = a.entity_id)) OR
  (a.entity_type = 'specialty' AND NOT EXISTS (SELECT 1 FROM catalog_specialties s WHERE s.slug = a.entity_id))
)
GROUP BY a.entity_type, a.entity_id
ON CONFLICT DO NOTHING;
