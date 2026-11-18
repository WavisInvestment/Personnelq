/*
  Company-made (custom) assessments.

  - Assessment.definition: the sections of a custom assessment and the wording for low / medium / high scores.
  - AssessmentQuestion.section_key: which section a custom question scores into.
  - AssessmentResult.custom_scores: a custom result's section scores, with the wording as it was when taken.
  - The empty placeholder "CustomAssessment" table is dropped: custom assessments are ordinary Assessment rows
    that belong to an organisation, so they reuse the whole taking flow (questions, answers, submissions, history).
*/

-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN "definition" JSONB;
ALTER TABLE "AssessmentQuestion" ADD COLUMN "section_key" TEXT;
ALTER TABLE "AssessmentResult" ADD COLUMN "custom_scores" JSONB;

-- DropTable
DROP TABLE "CustomAssessment";
