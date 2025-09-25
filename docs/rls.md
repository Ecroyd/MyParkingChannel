# Row Level Security (RLS) Documentation

This document explains the RLS policies implemented in the parking channel platform and why they're necessary for security and data isolation.

## Overview

Row Level Security (RLS) is a PostgreSQL feature that restricts which rows users can see and modify based on their identity. In our platform, RLS ensures:

1. **Data Isolation**: Users can only access their own tenant's data
2. **Admin Access**: Platform administrators can access all data
3. **Service Role Bypass**: Server-side operations can bypass RLS when needed
4. **Security**: Prevents unauthorized data access

## RLS Policies

### 1. Tenants Table

```sql
-- Service role can do everything (for admin operations)
CREATE POLICY "Service role can do everything on tenants" ON public.tenants
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can view their own tenants
CREATE POLICY "Allow authenticated users to view their own tenants" ON public.tenants
    FOR SELECT TO authenticated USING (
        id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid())
    );
```

**Why this works:**
- `service_role` bypasses RLS for admin operations (tenant creation, user management)
- Regular users can only see tenants they're members of
- No direct tenant creation by regular users

### 2. User Tenants Table

```sql
-- Service role can do everything
CREATE POLICY "Service role can do everything on user_tenants" ON public.user_tenants
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Users can view their own relationships
CREATE POLICY "Allow authenticated users to view their user_tenants" ON public.user_tenants
    FOR SELECT TO authenticated USING (user_id = auth.uid());
```

**Why this works:**
- `service_role` can create owner relationships during tenant provisioning
- Users can only see their own tenant memberships
- Prevents users from seeing other users' tenant relationships

### 3. Audit Logs Table

```sql
-- Only platform admins can read audit logs
CREATE POLICY "audit_admin_read" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.platform_admins 
            WHERE user_id = auth.uid()
        )
    );

-- Only service role can insert audit logs
CREATE POLICY "audit_service_insert" ON public.audit_logs
    FOR INSERT TO service_role
    WITH CHECK (true);
```

**Why this works:**
- Audit logs are sensitive - only platform admins should see them
- Only the system (service role) can write audit logs
- Prevents tampering with audit data

### 4. Platform Integrations Table

```sql
-- Only platform admins can read/write integrations
CREATE POLICY "pi_admin_read" ON public.platform_integrations
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.platform_admins 
            WHERE user_id = auth.uid()
        )
    );

-- Service role can do everything
CREATE POLICY "pi_service_all" ON public.platform_integrations
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
```

**Why this works:**
- API keys and integrations are sensitive
- Only platform admins should configure integrations
- Service role needs access for admin operations

## Service Role Usage

The `service_role` is used in server-side operations that need to bypass RLS:

### When to Use Service Role

✅ **Appropriate:**
- Tenant provisioning (creating tenants and users)
- User management (creating, updating, deleting users)
- Audit logging (recording system events)
- Admin operations (platform management)

❌ **Inappropriate:**
- Regular user operations
- Client-side code
- User-facing features
- Data that should respect RLS

### Service Role Security

1. **Server-Only**: Service role key is never exposed to client
2. **Admin Operations**: Only used for administrative tasks
3. **Audit Trail**: All service role operations are logged
4. **Limited Scope**: Only used where RLS bypass is necessary

## RLS vs Service Role

| Operation | RLS Policy | Service Role | Reason |
|-----------|------------|--------------|---------|
| User views own tenant | ✅ RLS | ❌ | User should use regular client |
| Admin creates tenant | ❌ RLS | ✅ | Admin operation, needs bypass |
| User creates booking | ✅ RLS | ❌ | User operation, should respect RLS |
| System logs audit | ❌ RLS | ✅ | System operation, needs bypass |
| Admin views all tenants | ❌ RLS | ✅ | Admin operation, needs bypass |

## Common RLS Patterns

### 1. User-Scoped Access
```sql
-- Users can only see their own data
CREATE POLICY "user_own_data" ON table_name
    FOR ALL TO authenticated
    USING (user_id = auth.uid());
```

### 2. Tenant-Scoped Access
```sql
-- Users can only see data from their tenants
CREATE POLICY "tenant_scoped" ON table_name
    FOR ALL TO authenticated
    USING (
        tenant_id IN (
            SELECT tenant_id FROM user_tenants 
            WHERE user_id = auth.uid()
        )
    );
```

### 3. Admin-Only Access
```sql
-- Only platform admins can access
CREATE POLICY "admin_only" ON table_name
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM platform_admins 
            WHERE user_id = auth.uid()
        )
    );
```

### 4. Service Role Bypass
```sql
-- Service role can do everything
CREATE POLICY "service_bypass" ON table_name
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);
```

## Testing RLS Policies

### 1. Test User Access
```sql
-- Switch to user context
SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "user-id"}';

-- Test query
SELECT * FROM tenants; -- Should only return user's tenants
```

### 2. Test Admin Access
```sql
-- Switch to admin context
SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "admin-user-id"}';

-- Test query
SELECT * FROM audit_logs; -- Should return all audit logs
```

### 3. Test Service Role
```sql
-- Switch to service role
SET LOCAL role TO service_role;

-- Test query
SELECT * FROM tenants; -- Should return all tenants
```

## Troubleshooting RLS Issues

### Common Problems

1. **"new row violates row-level security policy"**
   - **Cause**: Trying to insert data without proper RLS policy
   - **Solution**: Use service role for admin operations

2. **"permission denied for table"**
   - **Cause**: User doesn't have table permissions
   - **Solution**: Grant appropriate permissions to authenticated role

3. **"relation does not exist"**
   - **Cause**: RLS policy references non-existent table
   - **Solution**: Check table names in RLS policies

### Debugging Steps

1. **Check RLS Status**:
   ```sql
   SELECT schemaname, tablename, rowsecurity 
   FROM pg_tables 
   WHERE tablename = 'your_table';
   ```

2. **List Policies**:
   ```sql
   SELECT * FROM pg_policies 
   WHERE tablename = 'your_table';
   ```

3. **Test Policy**:
   ```sql
   EXPLAIN (ANALYZE, BUFFERS) 
   SELECT * FROM your_table;
   ```

## Best Practices

1. **Principle of Least Privilege**: Only grant necessary permissions
2. **Explicit Policies**: Don't rely on default permissions
3. **Test Thoroughly**: Test all user roles and scenarios
4. **Monitor Access**: Log and monitor RLS policy violations
5. **Document Changes**: Document all RLS policy changes
6. **Service Role Security**: Never expose service role to client
7. **Regular Audits**: Regularly review and audit RLS policies

## Migration Strategy

When adding new RLS policies:

1. **Create Policy**: Add the new policy
2. **Test in Development**: Verify policy works correctly
3. **Deploy to Staging**: Test with real data
4. **Monitor Production**: Watch for policy violations
5. **Document**: Update this documentation

## Security Considerations

1. **Never disable RLS**: Always keep RLS enabled
2. **Service role protection**: Keep service role key secure
3. **Regular audits**: Review RLS policies regularly
4. **User education**: Train users on RLS implications
5. **Monitoring**: Monitor for RLS policy violations
