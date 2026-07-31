-- Add the 'ops' tenant role: full operations access with all monetary figures hidden.
-- Application-side definition lives in src/lib/auth/permissions.ts.
--
-- user_tenants.role is not created by a migration in this repo, so the storage
-- shape is unknown. Handle both possibilities and no-op when neither applies.

-- Case 1: role is backed by an enum type.
DO $$
DECLARE
  role_type_name text;
  role_type_kind char;
BEGIN
  SELECT t.typname, t.typtype
    INTO role_type_name, role_type_kind
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_type t ON t.oid = a.atttypid
  WHERE n.nspname = 'public'
    AND c.relname = 'user_tenants'
    AND a.attname = 'role'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF role_type_kind = 'e' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = role_type_name
        AND e.enumlabel = 'ops'
    ) THEN
      EXECUTE format('ALTER TYPE public.%I ADD VALUE %L', role_type_name, 'ops');
    END IF;
  END IF;
END $$;

-- Case 2: role is text/varchar guarded by a CHECK constraint listing the allowed
-- values. Rebuild any such constraint with 'ops' included.
DO $$
DECLARE
  constraint_record record;
BEGIN
  FOR constraint_record IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'user_tenants'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%role%'
      AND pg_get_constraintdef(con.oid) NOT ILIKE '%''ops''%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.user_tenants DROP CONSTRAINT %I',
      constraint_record.conname
    );
    EXECUTE format(
      'ALTER TABLE public.user_tenants ADD CONSTRAINT %I CHECK (role IN (''owner'', ''admin'', ''ops'', ''user''))',
      constraint_record.conname
    );
  END LOOP;
END $$;

-- Mirror the same handling for invitation rows, which carry the role until accepted.
DO $$
DECLARE
  constraint_record record;
BEGIN
  FOR constraint_record IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'tenant_invitations'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%role%'
      AND pg_get_constraintdef(con.oid) NOT ILIKE '%''ops''%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.tenant_invitations DROP CONSTRAINT %I',
      constraint_record.conname
    );
    EXECUTE format(
      'ALTER TABLE public.tenant_invitations ADD CONSTRAINT %I CHECK (role IN (''owner'', ''admin'', ''ops'', ''user''))',
      constraint_record.conname
    );
  END LOOP;
END $$;
