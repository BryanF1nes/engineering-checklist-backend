-- AlterTable
ALTER TABLE "ChecklistItem" ADD COLUMN     "completedById" INTEGER,
ADD COLUMN     "userId" INTEGER;

-- CreateIndex
CREATE INDEX "ChecklistItem_completedById_idx" ON "ChecklistItem"("completedById");

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
