/*
  Payments by individuals.

  - Payment.organization_id becomes optional: NULL means a person paying for themselves
    (a company payment, such as a subscription, still carries its organisation).
  - Payment.user_id gets a real foreign key to User. If the user is later deleted the payment record is
    kept (user_id becomes NULL) so financial history is never lost.
  - Index for the entitlement lookup "has this user paid for this assessment?".
*/

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "organization_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Payment_user_id_assessment_id_idx" ON "Payment"("user_id", "assessment_id");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
