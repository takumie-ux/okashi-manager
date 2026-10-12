"use client";

// ブラウザ側のログイン処理。
// LIFF ID が設定されていれば本物のLINEログイン、未設定なら開発ログインを使う。

type AuthResult = { token: string; name: string };

export async function initAuth(): Promise<AuthResult> {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

  // 開発モード: LIFF未設定なら「開発ユーザー」として続行（localhostでもテスト可能）
  if (!liffId) {
    return { token: "DEV", name: "開発ユーザー" };
  }

  // 本番モード: LIFFを初期化してLINEログイン
  const liff = (await import("@line/liff")).default;
  await liff.init({ liffId });

  if (!liff.isLoggedIn()) {
    // ログイン後に戻るURLを明示する。
    // LIFF URLにパスを付けて開くと（例: liff.line.me/{id}/admin）、そのパスは
    // liff.state クエリパラメータとして現在のURLに乗っている。redirectUri を
    // 省略するとログインのリダイレクトでこれが失われ、ログイン後に liff.init() が
    // 遷移先を復元できず、/admin を開いてもトップページに着地してしまう。
    liff.login({ redirectUri: window.location.href });
    return new Promise<AuthResult>(() => {}); // 遷移するまで解決しない
  }

  const profile = await liff.getProfile();
  const token = liff.getAccessToken();
  if (!token) throw new Error("アクセストークンを取得できませんでした");

  return { token, name: profile.displayName };
}
