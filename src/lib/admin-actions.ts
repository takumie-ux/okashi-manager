"use server";

// 管理者専用のサーバー処理。各アクションの先頭で requireAdmin により権限確認する。

import { createServerSupabase } from "@/lib/supabase/server";
import { requireAdmin, resolveUser } from "@/lib/auth";
import type {
  AdminDataResult,
  Product,
  UnpaidRow,
  HistoryRow,
} from "@/lib/types";

/**
 * 管理ダッシュボードに必要なデータ一式を取得する。
 * 管理者でなければ例外ではなく { ok: false } を返す（画面側で確実に判別するため）。
 */
export async function getAdminData(token: string): Promise<AdminDataResult> {
  const user = await resolveUser(token);
  if (!user.is_admin) {
    return { ok: false, reason: "forbidden" };
  }
  const supabase = createServerSupabase();

  const [{ data: products, error: pe }, { data: purchases, error: qe }] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, name, price, stock, image_url, is_active")
        // created_at が同一でも並びが確定するよう id を第2キーにする
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
      supabase
        .from("purchases")
        .select("id, status, total_amount, created_at, user:users(display_name)")
        .order("created_at", { ascending: false }),
    ]);

  if (pe) throw new Error(pe.message);
  if (qe) throw new Error(qe.message);

  let totalPaid = 0;
  let totalUnpaid = 0;
  const unpaid: UnpaidRow[] = [];
  const history: HistoryRow[] = [];

  for (const p of purchases ?? []) {
    // 埋め込み結果はオブジェクト/配列どちらの型にも解釈されうるので両対応
    const u = Array.isArray(p.user) ? p.user[0] : p.user;
    const userName = u?.display_name ?? "不明";
    const status = p.status as "unpaid" | "paid";

    if (status === "paid") {
      totalPaid += p.total_amount;
    } else {
      totalUnpaid += p.total_amount;
      unpaid.push({
        purchaseId: p.id,
        userName,
        amount: p.total_amount,
        createdAt: p.created_at,
      });
    }
    history.push({
      purchaseId: p.id,
      userName,
      amount: p.total_amount,
      status,
      createdAt: p.created_at,
    });
  }

  const productList = (products ?? []) as Product[];
  const totalStock = productList.reduce((s, x) => s + x.stock, 0);

  return {
    ok: true,
    data: {
      products: productList,
      stats: {
        totalPaid,
        totalUnpaid,
        productCount: productList.length,
        totalStock,
      },
      unpaid,
      history: history.slice(0, 30),
    },
  };
}

/** 商品を追加 */
export async function addProduct(
  token: string,
  input: { name: string; price: number; stock: number }
) {
  await requireAdmin(token);
  const name = input.name?.trim();
  if (!name) throw new Error("商品名を入力してください");
  if (!Number.isInteger(input.price) || input.price < 0)
    throw new Error("価格は0以上の整数で入力してください");
  if (!Number.isInteger(input.stock) || input.stock < 0)
    throw new Error("在庫数は0以上の整数で入力してください");

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("products")
    .insert({ name, price: input.price, stock: input.stock });
  if (error) throw new Error(error.message);
  return { ok: true };
}

/** 商品を更新（価格・在庫・販売状態・名前を部分更新） */
export async function updateProduct(
  token: string,
  id: string,
  patch: { name?: string; price?: number; stock?: number; is_active?: boolean }
) {
  await requireAdmin(token);

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) throw new Error("商品名を入力してください");
    update.name = n;
  }
  if (patch.price !== undefined) {
    if (!Number.isInteger(patch.price) || patch.price < 0)
      throw new Error("価格は0以上の整数で入力してください");
    update.price = patch.price;
  }
  if (patch.stock !== undefined) {
    if (!Number.isInteger(patch.stock) || patch.stock < 0)
      throw new Error("在庫数は0以上の整数で入力してください");
    update.stock = patch.stock;
  }
  if (patch.is_active !== undefined) {
    update.is_active = patch.is_active;
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.from("products").update(update).eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/** 購入の支払い状態を管理者が手動で切り替える（回収確認・取り消し用） */
export async function setPurchasePaid(
  token: string,
  purchaseId: string,
  paid: boolean
) {
  await requireAdmin(token);
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("purchases")
    .update({
      status: paid ? "paid" : "unpaid",
      paid_at: paid ? new Date().toISOString() : null,
    })
    .eq("id", purchaseId);
  if (error) throw new Error(error.message);
  return { ok: true };
}
