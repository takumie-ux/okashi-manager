"use server";

// 管理者専用のサーバー処理。各アクションの先頭で requireAdmin により権限確認する。

import { createServerSupabase } from "@/lib/supabase/server";
import { requireAdmin, resolveUser } from "@/lib/auth";
import type {
  AdminDataResult,
  DeleteProductResult,
  Product,
  UnpaidRow,
  HistoryRow,
} from "@/lib/types";

type SoldInput = {
  products: { id: string; sold_reset_at: string | null }[];
  items: { product_id: string; quantity: number; purchase_id: string }[];
  purchases: { id: string; created_at: string }[];
};

/**
 * 商品IDごとの販売数を数える。
 * sold_reset_at（最後に補充した日時）より後の購入だけを対象にする。
 * null の商品は全期間を数える。
 */
function calcSoldByProduct({ products, items, purchases }: SoldInput) {
  const purchasedAt = new Map(purchases.map((p) => [p.id, p.created_at]));
  const resetAt = new Map(products.map((p) => [p.id, p.sold_reset_at]));
  const sold: Record<string, number> = {};
  for (const p of products) sold[p.id] = 0;
  for (const it of items) {
    const reset = resetAt.get(it.product_id) ?? null;
    if (reset) {
      const at = purchasedAt.get(it.purchase_id);
      if (!at || at <= reset) continue;
    }
    sold[it.product_id] = (sold[it.product_id] ?? 0) + it.quantity;
  }
  return sold;
}

/** リセット対象の商品について、販売数を数えるのに必要なデータをまとめて取る */
async function loadSoldData(
  supabase: ReturnType<typeof createServerSupabase>
) {
  const [{ data: products, error: pe }, { data: items, error: ie }, { data: purchases, error: qe }] =
    await Promise.all([
      supabase.from("products").select("id, stock, sold_reset_at"),
      supabase.from("purchase_items").select("product_id, quantity, purchase_id"),
      supabase.from("purchases").select("id, created_at"),
    ]);
  if (pe) throw new Error(pe.message);
  if (ie) throw new Error(ie.message);
  if (qe) throw new Error(qe.message);

  const list = (products ?? []) as {
    id: string;
    stock: number;
    sold_reset_at: string | null;
  }[];
  const sold = calcSoldByProduct({
    products: list,
    items: (items ?? []) as SoldInput["items"],
    purchases: (purchases ?? []) as SoldInput["purchases"],
  });
  return { list, sold };
}

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

  const [
    { data: products, error: pe },
    { data: purchases, error: qe },
    { data: items, error: ie },
  ] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, price, stock, image_url, is_active, sold_reset_at")
        // created_at が同一でも並びが確定するよう id を第2キーにする
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
      supabase
        .from("purchases")
        .select("id, status, total_amount, created_at, user:users(display_name)")
        .order("created_at", { ascending: false }),
      // 商品ごとの販売数を出すための明細。件数が多くないので全件取って集計する
      supabase.from("purchase_items").select("product_id, quantity, purchase_id"),
    ]);

  if (pe) throw new Error(pe.message);
  if (qe) throw new Error(qe.message);
  if (ie) throw new Error(ie.message);

  const soldByProduct = calcSoldByProduct({
    products: (products ?? []) as SoldInput["products"],
    items: (items ?? []) as SoldInput["items"],
    purchases: (purchases ?? []) as SoldInput["purchases"],
  });

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
      soldByProduct,
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

/**
 * 補充したときに押す。売れた分を在庫に戻し、販売数を0から数え直す。
 * 「売れた数だけ買い足した」という前提で在庫を復元する。
 */
export async function resetSoldCount(token: string, productId: string) {
  await requireAdmin(token);
  const supabase = createServerSupabase();

  const { list, sold } = await loadSoldData(supabase);
  const product = list.find((p) => p.id === productId);
  if (!product) throw new Error("商品が見つかりません");

  const added = sold[productId] ?? 0;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("products")
    .update({
      stock: product.stock + added,
      sold_reset_at: now,
      updated_at: now,
    })
    .eq("id", productId);
  if (error) throw new Error(error.message);
  return { added, stock: product.stock + added };
}

/**
 * すべての商品の販売数カウンターをまとめてリセットする。
 * 買い出しで一通り補充したときに使う。
 */
export async function resetAllSoldCounts(token: string) {
  await requireAdmin(token);
  const supabase = createServerSupabase();

  const { list, sold } = await loadSoldData(supabase);
  const now = new Date().toISOString();

  // 商品ごとに戻す数が違うので1件ずつ更新する（商品数は多くない）
  const results = await Promise.all(
    list.map((p) => {
      const added = sold[p.id] ?? 0;
      return supabase
        .from("products")
        .update({
          stock: p.stock + added,
          sold_reset_at: now,
          updated_at: now,
        })
        .eq("id", p.id)
        .then(({ error }) => ({ error, added }));
    })
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  return {
    reset: results.length,
    added: results.reduce((s, r) => s + r.added, 0),
  };
}

/**
 * 商品を削除する。購入履歴から参照されている商品は消せない
 * （履歴の整合性が壊れるため）。その場合は販売停止で対応してもらう。
 */
export async function deleteProduct(
  token: string,
  productId: string
): Promise<DeleteProductResult> {
  await requireAdmin(token);
  const supabase = createServerSupabase();

  const { count, error: ce } = await supabase
    .from("purchase_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);
  if (ce) throw new Error(ce.message);
  if ((count ?? 0) > 0) {
    return { ok: false, reason: "has_history" };
  }

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/**
 * 未払いの購入をまとめて回収済みにする。
 * 全員分の入金を確認できたときに使う。
 */
export async function markAllPaid(token: string) {
  await requireAdmin(token);
  const supabase = createServerSupabase();
  const now = new Date().toISOString();
  const { error, count } = await supabase
    .from("purchases")
    .update({ status: "paid", paid_at: now }, { count: "exact" })
    .eq("status", "unpaid");
  if (error) throw new Error(error.message);
  return { paid: count ?? 0 };
}

/**
 * 回収済みの購入記録をまとめて削除する。
 * 未払いは取り立てに必要なので残す（個別の ✕ で消せる）。
 */
export async function deletePaidPurchases(token: string) {
  await requireAdmin(token);
  const supabase = createServerSupabase();
  const { error, count } = await supabase
    .from("purchases")
    .delete({ count: "exact" })
    .eq("status", "paid");
  if (error) throw new Error(error.message);
  return { deleted: count ?? 0 };
}

/**
 * 購入記録を削除する。記録を消すだけで在庫は戻さない。
 * purchase_items は外部キーの ON DELETE CASCADE で一緒に消えるため、
 * その商品の累計販売数からも差し引かれる。
 */
export async function deletePurchase(token: string, purchaseId: string) {
  await requireAdmin(token);
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("purchases")
    .delete()
    .eq("id", purchaseId);
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
