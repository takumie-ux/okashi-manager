/**
 * LINEのアクセストークンをサーバー側で検証し、本人のプロフィールを取得する。
 *
 * クライアント（LIFF）から送られてくる userId をそのまま信用すると、
 * 他人になりすませてしまう。そこでクライアントからは liff.getAccessToken() で
 * 取得したアクセストークンを送ってもらい、サーバーでLINE APIに問い合わせて
 * 「本物のトークンか」「誰のものか」を検証する。
 */

export type LineProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
};

export async function getVerifiedLineProfile(
  accessToken: string
): Promise<LineProfile> {
  if (!accessToken) {
    throw new Error("アクセストークンがありません");
  }

  const res = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
    // トークン検証は毎回行う（キャッシュしない）
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("LINEアクセストークンの検証に失敗しました");
  }

  const profile = (await res.json()) as LineProfile;
  return profile;
}
