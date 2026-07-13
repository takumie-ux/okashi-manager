// app_settings テーブルが作成済みかを確認する開発用スクリプト。
// 実行:  node --env-file=.env.local scripts/check-settings.mjs

import { createClient } from "@supabase/supabase-js";

const baseUrl = new URL(process.env.SUPABASE_URL).origin;
const supabase = createClient(baseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await supabase
  .from("app_settings")
  .select("key, value, updated_at");

if (error) {
  console.error("NG:", error.message);
  console.error("→ app_settings テーブルがまだ作られていない可能性があります。");
  console.error("  supabase/settings.sql を Supabase の SQL Editor で実行してください。");
  process.exit(1);
}

console.log(`OK app_settings テーブルは存在します（登録キー数: ${data.length}）`);
for (const row of data) {
  // 画像は長いので冒頭だけ表示
  const v =
    row.key === "paypay_qr_image" && row.value
      ? `${row.value.slice(0, 40)}...（${row.value.length}文字）`
      : row.value;
  console.log(`  - ${row.key}: ${v}`);
}
