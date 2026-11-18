-- AlterTable
ALTER TABLE "User" ADD COLUMN     "platform_role" TEXT;

-- CreateIndex
CREATE INDEX "User_platform_role_idx" ON "User"("platform_role");
