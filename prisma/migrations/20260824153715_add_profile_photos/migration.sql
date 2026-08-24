-- Rename existing photoUrl column to facePhotoUrl (keeps existing data)
ALTER TABLE "extra_profiles" RENAME COLUMN "photoUrl" TO "facePhotoUrl";

-- Add new column for the full-body photo
ALTER TABLE "extra_profiles" ADD COLUMN "fullBodyPhotoUrl" TEXT;
