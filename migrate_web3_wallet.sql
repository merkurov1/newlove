-- Миграция для расширения таблицы users под Web3-авторизацию
-- Добавляет поля для wallet, nonce, auth_type


alter table "User"
add column if not exists wallet_address text unique,
add column if not exists auth_type text check (auth_type in ('google', 'wallet')) default 'google',
add column if not exists nonce text,
add column if not exists nonce_expires_at timestamptz;

-- Индекс для быстрого поиска по wallet_address
create index if not exists idx_user_wallet_address on "User"(wallet_address);

-- Пример RLS политики (настраивайте под свои нужды)
-- enable row level security;
-- create policy "Users can select their own row" on users for select using (auth.uid() = id);
