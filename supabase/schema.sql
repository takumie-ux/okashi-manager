-- ============================================================
-- お菓子管理アプリ データベーススキーマ
-- Supabase ダッシュボード > SQL Editor に貼り付けて実行してください。
-- ============================================================

-- UUID自動生成用の拡張
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- users : 研究室メンバー（LINEアカウントと1対1）
-- ------------------------------------------------------------
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  line_user_id  text unique not null,          -- LINEのuserId
  display_name  text not null,                 -- LINE表示名
  is_admin      boolean not null default false,-- 管理者フラグ（自分だけtrueにする）
  created_at    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- products : お菓子
-- ------------------------------------------------------------
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  price       integer not null check (price >= 0),   -- 円
  stock       integer not null default 0 check (stock >= 0), -- 在庫数
  image_url   text,                                  -- 商品画像（任意）
  is_active   boolean not null default true,         -- 販売中フラグ
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- purchases : 購入（1回の支払い単位）
-- ------------------------------------------------------------
create table if not exists public.purchases (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id),
  status        text not null default 'unpaid' check (status in ('unpaid','paid')),
  total_amount  integer not null default 0 check (total_amount >= 0), -- 合計金額スナップショット
  created_at    timestamptz not null default now(),
  paid_at       timestamptz                          -- 支払い完了日時（未払いはnull）
);

-- ------------------------------------------------------------
-- purchase_items : 購入明細
-- ------------------------------------------------------------
create table if not exists public.purchase_items (
  id           uuid primary key default gen_random_uuid(),
  purchase_id  uuid not null references public.purchases(id) on delete cascade,
  product_id   uuid not null references public.products(id),
  quantity     integer not null check (quantity > 0),
  unit_price   integer not null check (unit_price >= 0)  -- 購入時点の価格を保存（後で値上げしても履歴が狂わない）
);

-- ------------------------------------------------------------
-- app_settings : アプリ設定を key-value で保存（PayPay QR画像・有効期限など）
-- ------------------------------------------------------------
create table if not exists public.app_settings (
  key         text primary key,
  value       text,
  updated_at  timestamptz not null default now()
);

-- インデックス
create index if not exists idx_purchases_user      on public.purchases(user_id);
create index if not exists idx_purchases_status    on public.purchases(status);
create index if not exists idx_purchase_items_pur  on public.purchase_items(purchase_id);

-- ------------------------------------------------------------
-- RLS（行レベルセキュリティ）を有効化。
-- ポリシーを作らないので、匿名/一般クライアントからは一切アクセス不可。
-- アプリはサーバー側から service_role キーで操作する（service_roleはRLSを無視できる）。
-- ------------------------------------------------------------
alter table public.users          enable row level security;
alter table public.products       enable row level security;
alter table public.purchases      enable row level security;
alter table public.purchase_items enable row level security;
alter table public.app_settings   enable row level security;

-- ------------------------------------------------------------
-- create_purchase : 購入をアトミックに作成するRPC関数
--   在庫チェック→在庫減算→購入ヘッダ/明細作成 を1トランザクションで実施。
--   for update で対象商品行をロックし、同時購入による在庫マイナスを防ぐ。
--   引数 p_items は [{"product_id":"...","quantity":2}, ...] 形式のJSON。
-- ------------------------------------------------------------
create or replace function public.create_purchase(p_user_id uuid, p_items jsonb)
returns table (purchase_id uuid, total_amount integer)
language plpgsql
as $$
declare
  v_purchase_id uuid;
  v_total       integer := 0;
  v_item        jsonb;
  v_product_id  uuid;
  v_qty         integer;
  v_price       integer;
  v_stock       integer;
  v_name        text;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'カートが空です';
  end if;

  insert into public.purchases (user_id, status, total_amount)
  values (p_user_id, 'unpaid', 0)
  returning id into v_purchase_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty        := (v_item->>'quantity')::integer;

    if v_qty is null or v_qty <= 0 then
      raise exception '数量が不正です';
    end if;

    -- 対象商品を行ロックして在庫・価格を取得
    select price, stock, name into v_price, v_stock, v_name
    from public.products
    where id = v_product_id and is_active = true
    for update;

    if not found then
      raise exception '商品が見つかりません: %', v_product_id;
    end if;

    if v_stock < v_qty then
      raise exception '在庫不足です（%）: 残り%個, 要求%個', v_name, v_stock, v_qty;
    end if;

    update public.products
    set stock = stock - v_qty, updated_at = now()
    where id = v_product_id;

    insert into public.purchase_items (purchase_id, product_id, quantity, unit_price)
    values (v_purchase_id, v_product_id, v_qty, v_price);

    v_total := v_total + v_price * v_qty;
  end loop;

  update public.purchases set total_amount = v_total where id = v_purchase_id;

  return query select v_purchase_id, v_total;
end;
$$;

-- ============================================================
-- （任意）動作確認用のサンプル商品。テストが済んだら削除してOK。
-- ============================================================
-- insert into public.products (name, price, stock) values
--   ('ポテトチップス', 120, 10),
--   ('チョコレート',   100, 15),
--   ('グミ',            80, 20);
