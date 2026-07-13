import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * サーバー専用の Supabase クライアントを生成する。
 *
 * service_role キーは RLS（行レベルセキュリティ）を無視できる強力な権限を持つ。
 * 必ずサーバー側（Server Action / Route Handler）だけで使い、
 * ブラウザには絶対に渡さないこと（NEXT_PUBLIC_ を付けない）。
 */
export function createServerSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabaseの環境変数が未設定です。.env.local に SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください。"
    );
  }

  // 「.../rest/v1/」などのパスが付いていても動くよう、オリジン部分だけに正規化する
  let baseUrl: string;
  try {
    baseUrl = new URL(url).origin;
  } catch {
    throw new Error(`SUPABASE_URL が不正なURLです: ${url}`);
  }

  return createClient(baseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
