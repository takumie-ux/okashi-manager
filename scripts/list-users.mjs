// usersテーブルの一覧を表示する開発用スクリプト。
// 誰が登録済みか・誰が管理者かを確認する。
// 実行:  node --env-file=.env.local scripts/list-users.mjs

import { createClient } from "@supabase/supabase-js";

const baseUrl = new URL(process.env.SUPABASE_URL).origin;
const supabase = createClient(baseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await supabase
  .from("users")
  .select("line_user_id, display_name, is_admin, created_at")
  .order("created_at", { ascending: true });

if (error) {
  console.error("NG:", error.message);
  process.exit(1);
}

console.log(`ユーザー数: ${data.length}`);
for (const u of data) {
  const mark = u.is_admin ? "★管理者" : "　一般　";
  console.log(`  ${mark} | ${u.display_name} | ${u.line_user_id}`);
}
