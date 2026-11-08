-- AlterTable
ALTER TABLE "User"
ADD COLUMN "firstName" TEXT,
ADD COLUMN "lastName" TEXT;

-- Migrate existing names
WITH normalized_names AS (
    SELECT
        id,
        regexp_replace(
            btrim(name),
            '[[:space:]]+',
            ' ',
            'g'
        ) AS full_name
    FROM "User"
)
UPDATE "User" AS users
SET
    "firstName" = NULLIF(
        split_part(normalized.full_name, ' ', 1),
        ''
    ),
    "lastName" = NULLIF(
        regexp_replace(
            normalized.full_name,
            '^[^ ]+[ ]?',
            ''
        ),
        ''
    )
FROM normalized_names AS normalized
WHERE users.id = normalized.id;
