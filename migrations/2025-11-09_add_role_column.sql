-- Add role column to users table
-- Date: 2025-11-09
-- Required for Tag RLS policies to work

-- 1. Add role column with default 'user'
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- 2. Set existing users to 'user' role
UPDATE users SET role = 'user' WHERE role IS NULL;

-- 3. Set your admin user (replace with your email)
-- UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';

-- 4. Create index for faster role lookups
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

-- 5. Verify
SELECT id, email, name, role FROM users LIMIT 5;
