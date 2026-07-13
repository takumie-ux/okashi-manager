-- ============================================================
-- 追加マイグレーション：アプリ設定テーブル
-- PayPay受け取りQR（マイコード）画像と有効期限を保存するために使う。
-- Supabase ダッシュボード > SQL Editor に貼り付けて実行してください。
-- （既存テーブルには影響しません。1回だけ実行すればOK）
-- ============================================================

-- ------------------------------------------------------------
-- app_settings : アプリ全体の設定を key-value で保存する
--   例) key='paypay_qr_image'   value= data URL（画像をbase64化した文字列）
--       key='paypay_qr_expires' value= 有効期限（'2026-07-27' など）
-- ------------------------------------------------------------
create table if not exists public.app_settings (
  key         text primary key,
  value       text,
  updated_at  timestamptz not null default now()
);

-- RLSを有効化（ポリシー無し＝サーバーの service_role からのみアクセス可能）
alter table public.app_settings enable row level security;
