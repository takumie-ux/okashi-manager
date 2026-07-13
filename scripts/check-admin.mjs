// 管理画面の集計クエリ（購入とユーザーの埋め込み）が動くか検証する開発用スクリプト。
// 実行:  node --env-file=.env.local scripts/check-admin.mjs

import { createClient } from "@supabase/supabase-js";

const baseUrl = new URL(process.env.SUPABASE_URL).origin;
const supabase = createClient(baseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await supabase
  .from("purchases")
  .select("id, status, total_amount, created_at, user:users(display_name)")
  .order("created_at", { ascending: false })
  .limit(5);

if (error) {
  console.error("NG 埋め込みクエリ:", error.message);
  process.exit(1);
}

console.log(`OK 埋め込みクエリ成功（${data.length}件取得）`);
if (data.length > 0) {
  console.log("サンプル:", JSON.stringify(data[0], null, 2));
}
