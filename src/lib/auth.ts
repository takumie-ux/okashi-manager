// サーバー側で「今のユーザーが誰か」を確定するモジュール。
// このファイルはサーバー専用（Server Action からのみ import される）。

import { createServerSupabase } from "@/lib/supabase/server";
import { getVerifiedLineProfile } from "@/lib/line";
import type { AppUser } from "@/lib/types";

// 開発用ログインの合言葉。本番では拒否する。
const DEV_TOKEN = "DEV";

/**
 * クライアントから渡されたトークンを検証し、対応するユーザーを返す（無ければ作成）。
 * - 本番: LINEアクセストークンをLINE APIで検証して userId を確定
 * - 開発: token === "DEV" のとき「開発ユーザー」を使う（NODE_ENV=production では禁止）
 */
export async function resolveUser(token: string): Promise<AppUser> {
  let lineUserId: string;
  let displayName: string;

  if (token === DEV_TOKEN) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("開発用ログインは本番環境では使用できません");
    }
    lineUserId = "DEV_USER";
    displayName = "開発ユーザー";
  } else {
    const profile = await getVerifiedLineProfile(token);
    lineUserId = profile.userId;
    displayName = profile.displayName;
  }

  const supabase = createServerSupabase();

  // 初回は作成、以降は表示名を最新化（is_admin は payload に含めないので維持される）
  const { data, error } = await supabase
    .from("users")
    .upsert(
      { line_user_id: lineUserId, display_name: displayName },
      { onConflict: "line_user_id" }
    )
    .select("id, line_user_id, display_name, is_admin")
    .single();

  if (error) {
    throw new Error(`ユーザー登録に失敗しました: ${error.message}`);
  }
  return data as AppUser;
}

/** 管理者であることを要求する。管理者でなければ例外を投げる。 */
export async function requireAdmin(token: string): Promise<AppUser> {
  const user = await resolveUser(token);
  if (!user.is_admin) {
    throw new Error("管理者権限がありません");
  }
  return user;
}
