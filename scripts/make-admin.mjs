// 指定したLINEユーザーを管理者にする開発用スクリプト。
// 実行:  node --env-file=.env.local scripts/make-admin.mjs [line_user_id]
//   引数を省略すると開発ユーザー(DEV_USER)を管理者にする。
//   本番では、自分のLINE userId を引数に渡す（初回ログイン後にusersテーブルで確認できる）。

import { createClient } from "@supabase/supabase-js";

const baseUrl = new URL(process.env.SUPABASE_URL).origin;
const supabase = createClient(baseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const lineUserId = process.argv[2] || "DEV_USER";

// 既存ユーザーなら is_admin だけ更新（表示名は上書きしない）
const { data: updated, error: uErr } = await supabase
  .from("users")
  .update({ is_admin: true })
  .eq("line_user_id", lineUserId)
  .select("id, display_name")
  .maybeSingle();

if (uErr) {
  console.error("NG:", uErr.message);
  process.exit(1);
}

if (updated) {
  console.log(`✅ 既存ユーザー「${updated.display_name}」を管理者にしました`);
  process.exit(0);
}

// 存在しない場合は作成（主に開発ユーザー用）
const name = lineUserId === "DEV_USER" ? "開発ユーザー" : lineUserId;
const { error: iErr } = await supabase
  .from("users")
  .insert({ line_user_id: lineUserId, display_name: name, is_admin: true });

if (iErr) {
  console.error("NG:", iErr.message);
  process.exit(1);
}
console.log(`✅ ユーザー「${name}」を管理者として新規作成しました`);
