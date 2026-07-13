"use server";

// クライアント（ブラウザ）から呼び出せるサーバー処理（Server Actions）。
// DB操作はここ（サーバー側）に集約し、ブラウザからDBへ直接触らせない。

import { createServerSupabase } from "@/lib/supabase/server";
import { resolveUser } from "@/lib/auth";
import type { Product, CartItem, PaypayQr } from "@/lib/types";

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

/** 支払い画面に表示するPayPay受け取りQR（マイコード）を取得 */
export async function getPaypayQr(): Promise<PaypayQr> {
  const empty: PaypayQr = { imageDataUrl: null, expiresAt: null };
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["paypay_qr_image", "paypay_qr_expires"]);

  // テーブル未作成などで失敗しても購入は続行できるよう、QRは無しとして扱う
  // （DB接続そのものの異常は、並行して呼ぶ getProducts 側で表面化する）
  if (error) return empty;

  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string | null]));
  return {
    imageDataUrl: map.get("paypay_qr_image") ?? null,
    expiresAt: map.get("paypay_qr_expires") ?? null,
  };
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

/** 自分の購入を「支払い済み」にする（自己申告） */
export async function markPurchasePaid(token: string, purchaseId: string) {
  const user = await resolveUser(token);
  const supabase = createServerSupabase();

  const { error } = await supabase
    .from("purchases")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", purchaseId)
    .eq("user_id", user.id) // 自分の購入だけ更新できる
    .eq("status", "unpaid");

  if (error) throw new Error(error.message);
  return { ok: true };
}
