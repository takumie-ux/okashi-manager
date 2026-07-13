// 購入ロジック（create_purchase RPC）の検証スクリプト。
// 実行:  node --env-file=.env.local scripts/test-purchase.mjs
// テストデータは最後に自動削除するのでDBは元の状態に戻る。

import { createClient } from "@supabase/supabase-js";

const baseUrl = new URL(process.env.SUPABASE_URL).origin;
const supabase = createClient(baseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function assert(cond, msg) {
  if (!cond) {
    console.error("NG:", msg);
    process.exit(1);
  }
}

// 1. テスト用ユーザーを用意
const { data: user, error: uErr } = await supabase
  .from("users")
  .upsert(
    { line_user_id: "TEST_USER", display_name: "テストユーザー" },
    { onConflict: "line_user_id" }
  )
  .select("id")
  .single();
assert(!uErr, uErr?.message);

// 2. 最初の商品と現在の在庫を取得
const { data: product, error: pErr } = await supabase
  .from("products")
  .select("id, name, price, stock")
  .order("created_at")
  .limit(1)
  .single();
assert(!pErr, pErr?.message);
const before = product.stock;
console.log(`対象商品: ${product.name} / 在庫 ${before} / 単価 ¥${product.price}`);

// 3. 数量1で購入
const { data: rpc, error: rErr } = await supabase.rpc("create_purchase", {
  p_user_id: user.id,
  p_items: [{ product_id: product.id, quantity: 1 }],
});
assert(!rErr, rErr?.message);
const row = Array.isArray(rpc) ? rpc[0] : rpc;
console.log(`購入作成: 合計 ¥${row.total_amount}`);
assert(row.total_amount === product.price, `合計金額が不一致: ${row.total_amount}`);

// 4. 在庫が1減ったか
const { data: after } = await supabase
  .from("products")
  .select("stock")
  .eq("id", product.id)
  .single();
console.log(`在庫: ${before} -> ${after.stock}`);
assert(after.stock === before - 1, "在庫が正しく減っていません");

// 5. 購入・明細レコードの確認
const { data: purchase } = await supabase
  .from("purchases")
  .select("status, total_amount")
  .eq("id", row.purchase_id)
  .single();
assert(purchase.status === "unpaid", "初期ステータスがunpaidではありません");
const { data: items } = await supabase
  .from("purchase_items")
  .select("quantity, unit_price")
  .eq("purchase_id", row.purchase_id);
assert(
  items.length === 1 && items[0].quantity === 1 && items[0].unit_price === product.price,
  "明細が正しくありません"
);

// 6. 在庫超過の購入は失敗すること（在庫マイナス防止のガード確認）
const { error: overErr } = await supabase.rpc("create_purchase", {
  p_user_id: user.id,
  p_items: [{ product_id: product.id, quantity: 999999 }],
});
assert(overErr, "在庫超過購入がエラーになりませんでした");
console.log("在庫超過購入は正しく拒否:", overErr.message);

// 7. 後片付け（テストデータ削除・在庫復元）
await supabase.from("purchases").delete().eq("id", row.purchase_id); // 明細はcascade削除
await supabase.from("products").update({ stock: before }).eq("id", product.id);
await supabase.from("users").delete().eq("line_user_id", "TEST_USER");

console.log("\n✅ 購入ロジックの検証に成功しました（テストデータは削除済み）");
