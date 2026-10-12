# セットアップ手順

初心者向けに、外部サービスの準備を順番に説明します。焦らず1つずつ進めてOKです。
分からないところはチャットで質問してください。

---

## 全体像（何を準備するか）

| サービス | 役割 | 費用 |
|----------|------|------|
| **Supabase** | データベース（商品・購入・在庫・ユーザーを保存） | 無料枠 |
| **GitHub** | ソースコードの置き場（Vercelと連携） | 無料 |
| **Vercel** | アプリを公開（HTTPS付き。QRから開く先） | 無料枠 |
| **LINE Developers** | LINEログイン（誰が買ったかを識別） | 無料 |

集金はLINEのトーク上で行うため、**PayPay側の準備は不要**です（アプリはPayPayに一切接続しません）。

準備の順番（おすすめ）：**① Supabase → ② GitHub → ③ Vercel → ④ LINE**

> まずは **① Supabase だけ** 終わればローカルで開発を進められます。残りは後からでOK。

---

## ① Supabase（データベース）

1. https://supabase.com/ にアクセスし、GitHubアカウント等でサインアップ
2. 「New project」でプロジェクトを作成
   - Name: 例）`okashi-manager`
   - Database Password: 自動生成でOK（控えておく）
   - Region: `Northeast Asia (Tokyo)` を推奨
3. プロジェクトができたら、左メニューの **SQL Editor** を開く
4. このリポジトリの [`supabase/schema.sql`](../supabase/schema.sql) の中身を全部コピーして貼り付け、**Run** で実行
   - テーブル（users / products / purchases / purchase_items）と購入用の関数が作られます
5. 左メニュー **Project Settings（歯車）> Data API** で **Project URL** を確認
6. **Project Settings > API Keys** で **service_role** キーを表示してコピー
   - ⚠️ service_role はとても強力な鍵。人に見せない・GitHubに載せないこと。
7. プロジェクト直下の `.env.local` に貼り付け：
   ```
   SUPABASE_URL=（Project URL）
   SUPABASE_SERVICE_ROLE_KEY=（service_role キー）
   ```

これで①は完了です。

---

## ② GitHub（コード置き場）

1. https://github.com/ でアカウント作成（既にあればOK）
2. コードをリポジトリに push する（この作業はチャットで一緒にやります）

---

## ③ Vercel（公開）

1. https://vercel.com/ にGitHubアカウントでサインアップ
2. 「Add New… > Project」で ② のリポジトリをインポート
3. **Environment Variables** に `.env.local` と同じ変数を登録
   （`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_LIFF_ID`）
4. Deploy すると `https://xxxx.vercel.app` のURLが発行される（LIFFのエンドポイントに使う）

---

## ④ LINE Developers（ログイン）

> LIFFは公開URL（https）が必要です。先に③でVercelのURLを用意しておくとスムーズ。

1. https://developers.line.biz/console/ にLINEアカウントでログイン
2. **プロバイダー** を作成（例：研究室名）
3. 「新規チャネル作成」→ **LINEログイン** を選択して作成
   - チャネル名・説明などを入力（アプリ種別は「ウェブアプリ」）
4. 作成したチャネルの **LIFF** タブ →「追加」
   - LIFFアプリ名：例）`お菓子購入`
   - サイズ：**Full**
   - エンドポイントURL：③のVercel URL（例 `https://xxxx.vercel.app`）
   - Scope：**profile**, **openid** にチェック
5. 発行された **LIFF ID**（例 `0000000000-abcdefgh`）を控えて設定：
   ```
   NEXT_PUBLIC_LIFF_ID=（LIFF ID）
   ```
   `.env.local` と Vercel の環境変数、両方に入れる。

---

## ⑤ 集金の運用（アプリの外側）

**アプリはPayPayに接続しません。** 支払いに関する画面もありません。集金は次の流れで行います。

1. 管理画面の **未払い一覧** を開き、誰にいくらの未払いがあるかを確認する
2. その人に **LINEで催促** する（例：「今月のお菓子代、¥340をPayPayで送ってください」）
3. 相手が **LINEのトーク画面から PayPay で送金** する
   （トーク画面の「＋」→「送金」。LINEアカウントとPayPayの連携が必要です）
4. 入金を確認したら、管理画面で **「回収済みに」** を押す

> PayPayの受け取りQRを掲示する方式は採用していません。
> 個人の受け取りQRは約2週間で期限が切れて貼り替えが必要になり、
> 期限のないコードを使うには加盟店登録（有料）が要るためです。
> LINEログインで購入者が特定できているので、トーク上で完結させる方が手間が少なくなります。

---

## 環境変数まとめ

`.env.local`（ローカル用。Gitに載りません）と Vercel の両方に同じ値を設定します。

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_LIFF_ID=...
```
