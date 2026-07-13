// テスト用のサンプル商品を投入する開発用スクリプト。
// 実行:  node --env-file=.env.local scripts/seed.mjs
// 既に商品があればスキップする（重複投入しない）。

import { createClient } from "@supabase/supabase-js";

const baseUrl = new URL(process.env.SUPABASE_URL).origin;
const supabase = createClient(baseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { count, error: countError } = await supabase
  .from("products")
  .select("*", { count: "exact", head: true });

if (countError) {
  console.error("NG:", countError.message);
  process.exit(1);
}

if (count && count > 0) {
  console.log(`既に ${count} 件の商品があります。シードをスキップしました。`);
  process.exit(0);
}

const { error } = await supabase.from("products").insert([
  { name: "ポテトチップス", price: 120, stock: 10 },
  { name: "チョコレート", price: 100, stock: 15 },
  { name: "グミ", price: 80, stock: 20 },
  { name: "クッキー", price: 150, stock: 8 },
]);

if (error) {
  console.error("NG:", error.message);
  process.exit(1);
}
console.log("✅ サンプル商品を4件追加しました");
