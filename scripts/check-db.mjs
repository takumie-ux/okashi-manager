// Supabase への接続とテーブルの存在を確認する開発用スクリプト。
// 実行:  node --env-file=.env.local scripts/check-db.mjs
// （--env-file により .env.local が読み込まれる。キーの中身は表示しない）

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("NG: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が読み込めていません");
  process.exit(1);
}

// 「.../rest/v1/」などのパスが付いていてもオリジンだけに正規化する
let baseUrl;
try {
  baseUrl = new URL(url).origin;
} catch {
  console.error(`NG: SUPABASE_URL が不正なURLです -> ${url}`);
  process.exit(1);
}
if (!baseUrl.endsWith(".supabase.co")) {
  console.error(`NG: SUPABASE_URL のホストが不正です -> ${baseUrl}`);
  process.exit(1);
}
console.log("接続先URL:", baseUrl);

const supabase = createClient(baseUrl, key, { auth: { persistSession: false } });

const tables = ["users", "products", "purchases", "purchase_items"];
let ok = true;

for (const t of tables) {
  const { error, count } = await supabase
    .from(t)
    .select("*", { count: "exact", head: true });
  if (error) {
    console.error(`NG テーブル ${t}: ${error.message}`);
    ok = false;
  } else {
    console.log(`OK テーブル ${t}: ${count ?? 0} 件`);
  }
}

// 購入用RPC関数の存在チェック（引数不正で弾かれる=関数は存在する、を利用）
const { error: rpcError } = await supabase.rpc("create_purchase", {
  p_user_id: "00000000-0000-0000-0000-000000000000",
  p_items: [],
});
if (rpcError && /function .*create_purchase.* does not exist/i.test(rpcError.message)) {
  console.error("NG 関数 create_purchase が存在しません");
  ok = false;
} else {
  console.log("OK 関数 create_purchase: 存在を確認");
}

console.log(ok ? "\n✅ すべて確認できました" : "\n❌ 未解決の項目があります");
process.exit(ok ? 0 : 1);
