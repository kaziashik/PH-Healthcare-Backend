/*
  Warnings:

  - The primary key for the `doctor_embeddings` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "doctor_embeddings" DROP CONSTRAINT "doctor_embeddings_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "doctor_embeddings_pkey" PRIMARY KEY ("id");
