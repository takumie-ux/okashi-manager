"use server";

// クライアント（ブラウザ）から呼び出せるサーバー処理（Server Actions）。
// DB操作はここ（サーバー側）に集約し、ブラウザからDBへ直接触らせない。

import { createServerSupabase } from "@/lib/supabase/server";
import { resolveUser } from "@/lib/auth";
import type { Product, CartItem } from "@/lib/types";

/** 販売中の商品一覧を取得 */
export async function getProducts(): Promise<Product[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, price, stock, image_url, is_active")
    .eq("is_active", true)
    // created_at が同一でも並びが確定するよう id を第2キーにする（購入後も順序が変わらない）
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Product[];
}

/** 購入を確定（在庫減算＋購入記録をアトミックに実施） */
export async function submitPurchase(token: string, items: CartItem[]) {
  if (!items || items.length === 0) {
    throw new Error("カートが空です");
  }
  const user = await resolveUser(token);
  const supabase = createServerSupabase();

  const { data, error } = await supabase.rpc("create_purchase", {
    p_user_id: user.id,
    p_items: items,
  });
  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  return {
    purchaseId: row.purchase_id as string,
    total: row.total_amount as number,
    userName: user.display_name,
  };
}

// 支払い状態の更新は管理者のみが行う（admin-actions.ts の setPurchasePaid）。
// 集金は管理画面の未払い一覧を見て、管理者がLINEで催促する運用のため、
// 購入者側から「支払いました」と自己申告する導線は持たない。
