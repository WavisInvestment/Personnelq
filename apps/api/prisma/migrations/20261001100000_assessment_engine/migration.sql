/*
  Assessment engine groundwork.

  - Assessment.organization_id, AssessmentSubmission.organization_id and AssessmentResult.organization_id
    become optional: NULL means a platform-owned assessment / a person taking it as an individual.
    (The old default of 'system' pointed at an organisation that never existed.)
  - Assessment.slug (+ unique slug/version) gives platform assessments a stable key.
  - Question numbers are unique within an assessment.
  - Database guards so the official assessments really are immutable and completed attempts are never
    overwritten, regardless of which code path touches the data.
*/

-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN "slug" TEXT,
ALTER COLUMN "organization_id" DROP NOT NULL,
ALTER COLUMN "organization_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AssessmentResult" ALTER COLUMN "organization_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "AssessmentSubmission" ALTER COLUMN "organization_id" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Assessment_slug_version_key" ON "Assessment"("slug", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentQuestion_assessment_id_question_number_key" ON "AssessmentQuestion"("assessment_id", "question_number");

-- Guard: a locked assessment cannot be deleted, unlocked, or have its definition changed
CREATE FUNCTION guard_locked_assessment() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_locked THEN
      RAISE EXCEPTION 'Locked assessment % cannot be deleted', OLD.id USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.is_locked AND (
       NEW.is_locked IS DISTINCT FROM OLD.is_locked
    OR NEW.slug IS DISTINCT FROM OLD.slug
    OR NEW.type IS DISTINCT FROM OLD.type
    OR NEW.framework IS DISTINCT FROM OLD.framework
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.total_questions IS DISTINCT FROM OLD.total_questions
    OR NEW.scoring_method IS DISTINCT FROM OLD.scoring_method
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
  ) THEN
    RAISE EXCEPTION 'Locked assessment % cannot be changed', OLD.id USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assessment_locked_guard
  BEFORE UPDATE OR DELETE ON "Assessment"
  FOR EACH ROW EXECUTE FUNCTION guard_locked_assessment();

-- Guard: questions of a locked assessment cannot be edited or removed
CREATE FUNCTION guard_locked_question() RETURNS trigger AS $$
DECLARE
  parent_locked boolean;
BEGIN
  SELECT is_locked INTO parent_locked FROM "Assessment" WHERE id = OLD.assessment_id;
  IF parent_locked THEN
    RAISE EXCEPTION 'Questions of a locked assessment cannot be changed (assessment %)', OLD.assessment_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assessment_question_locked_guard
  BEFORE UPDATE OR DELETE ON "AssessmentQuestion"
  FOR EACH ROW EXECUTE FUNCTION guard_locked_question();

-- Guard: once an attempt is completed (locked), its answers are history and never change.
-- Cascading deletes (e.g. removing a user) are unaffected because the parent row is already gone.
CREATE FUNCTION guard_locked_answer() RETURNS trigger AS $$
DECLARE
  parent_locked boolean;
BEGIN
  SELECT is_locked INTO parent_locked FROM "AssessmentSubmission" WHERE id = OLD.submission_id;
  IF parent_locked THEN
    RAISE EXCEPTION 'Answers of a completed assessment cannot be changed (submission %)', OLD.submission_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assessment_answer_locked_guard
  BEFORE UPDATE OR DELETE ON "AssessmentAnswer"
  FOR EACH ROW EXECUTE FUNCTION guard_locked_answer();
