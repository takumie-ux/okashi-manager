"use client";

import { useEffect, useState } from "react";
import { initAuth } from "@/lib/liff";
import {
  getAdminData,
  addProduct,
  updateProduct,
  setPurchasePaid,
  setPaypayQr,
} from "@/lib/admin-actions";
import { getPaypayQr } from "@/lib/actions";
import type { AdminData, Product, PaypayQr } from "@/lib/types";

type Phase = "loading" | "ready" | "unauthorized" | "error";

const LOW_STOCK = 3; // これ以下で在庫僅少アラート

export default function AdminPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [token, setToken] = useState("");
  const [data, setData] = useState<AdminData | null>(null);
  const [qr, setQr] = useState<PaypayQr | null>(null);
  const [msg, setMsg] = useState("");

  const load = async (tk: string) => {
    const [d, q] = await Promise.all([getAdminData(tk), getPaypayQr()]);
    setData(d);
    setQr(q);
    setPhase("ready");
  };

  useEffect(() => {
    (async () => {
      try {
        const auth = await initAuth();
        setToken(auth.token);
        await load(auth.token);
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        if (m.includes("管理者権限")) setPhase("unauthorized");
        else {
          setMsg(m);
          setPhase("error");
        }
      }
    })();
  }, []);

  const reload = async () => {
    try {
      await load(token);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  if (phase === "loading")
    return <Centered>読み込み中...</Centered>;
  if (phase === "unauthorized")
    return (
      <Centered>
        <p className="font-semibold">管理者専用ページです</p>
        <p className="mt-2 text-sm text-gray-500">
          このアカウントには管理者権限がありません。
        </p>
      </Centered>
    );
  if (phase === "error" || !data)
    return (
      <Centered>
        <p className="font-semibold text-red-600">エラー</p>
        <p className="mt-2 text-sm text-gray-500">{msg}</p>
      </Centered>
    );

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-4 pb-16">
      <header className="pt-2 text-center">
        <h1 className="text-xl font-bold">🔧 管理画面</h1>
      </header>

      {/* ダッシュボード */}
      <section className="grid grid-cols-2 gap-3">
        <Stat label="回収済み売上" value={`¥${data.stats.totalPaid}`} accent="emerald" />
        <Stat label="未回収額" value={`¥${data.stats.totalUnpaid}`} accent="amber" />
        <Stat label="商品数" value={`${data.stats.productCount}`} />
        <Stat label="在庫合計" value={`${data.stats.totalStock}`} />
      </section>

      {/* 商品管理 */}
      <section>
        <h2 className="mb-2 font-bold">商品管理</h2>
        <AddProductForm token={token} onDone={reload} />
        <ul className="mt-3 flex flex-col gap-2">
          {data.products.map((p) => (
            <ProductRow key={p.id} product={p} token={token} onDone={reload} />
          ))}
        </ul>
      </section>

      {/* PayPay受け取りQR管理 */}
      <section>
        <h2 className="mb-2 font-bold">PayPay受け取りQR</h2>
        <PaypayQrManager token={token} qr={qr} onDone={reload} />
      </section>

      {/* 未払い一覧 */}
      <section>
        <h2 className="mb-2 font-bold">
          未払い一覧{" "}
          <span className="text-sm font-normal text-gray-500">
            （{data.unpaid.length}件）
          </span>
        </h2>
        {data.unpaid.length === 0 ? (
          <p className="text-sm text-gray-500">未払いはありません 🎉</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.unpaid.map((u) => (
              <li
                key={u.purchaseId}
                className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950"
              >
                <div>
                  <p className="font-semibold">{u.userName}</p>
                  <p className="text-xs text-gray-500">
                    {formatDate(u.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold">¥{u.amount}</span>
                  <button
                    onClick={async () => {
                      await setPurchasePaid(token, u.purchaseId, true);
                      reload();
                    }}
                    className="rounded bg-emerald-600 px-2 py-1 text-xs text-white"
                  >
                    回収済みに
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 購入履歴 */}
      <section>
        <h2 className="mb-2 font-bold">購入履歴（最新30件）</h2>
        {data.history.length === 0 ? (
          <p className="text-sm text-gray-500">まだ購入がありません。</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {data.history.map((h) => (
              <li
                key={h.purchaseId}
                className="flex items-center justify-between border-b border-gray-100 py-1 dark:border-gray-800"
              >
                <span className="text-gray-500">{formatDate(h.createdAt)}</span>
                <span className="flex-1 px-2">{h.userName}</span>
                <span className="font-semibold">¥{h.amount}</span>
                {h.status === "paid" ? (
                  <button
                    onClick={async () => {
                      await setPurchasePaid(token, h.purchaseId, false);
                      reload();
                    }}
                    className="rounded border border-emerald-300 px-1.5 py-0.5 text-xs text-emerald-600"
                    title="誤って支払い済みにした場合、未払いに戻します"
                  >
                    済 ⟲
                  </button>
                ) : (
                  <span className="px-1.5 text-amber-600">未</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {msg && <p className="text-center text-sm text-red-600">{msg}</p>}
    </main>
  );
}

// ---- 部品 ----

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "amber";
}) {
  const color =
    accent === "emerald"
      ? "text-emerald-600"
      : accent === "amber"
        ? "text-amber-600"
        : "";
  return (
    <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function AddProductForm({
  token,
  onDone,
}: {
  token: string;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      await addProduct(token, {
        name,
        price: Number(price),
        stock: Number(stock),
      });
      setName("");
      setPrice("");
      setStock("");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-dashed border-gray-300 p-3 dark:border-gray-600">
      <p className="mb-2 text-sm font-semibold">商品を追加</p>
      <div className="flex flex-col gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="商品名"
          className="rounded border border-gray-300 px-2 py-1 text-sm dark:bg-gray-900"
        />
        <div className="flex gap-2">
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="価格(円)"
            inputMode="numeric"
            className="w-1/2 rounded border border-gray-300 px-2 py-1 text-sm dark:bg-gray-900"
          />
          <input
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            placeholder="初期在庫"
            inputMode="numeric"
            className="w-1/2 rounded border border-gray-300 px-2 py-1 text-sm dark:bg-gray-900"
          />
        </div>
        <button
          onClick={submit}
          disabled={busy}
          className="rounded bg-gray-800 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? "追加中..." : "追加する"}
        </button>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </div>
  );
}

function ProductRow({
  product,
  token,
  onDone,
}: {
  product: Product;
  token: string;
  onDone: () => void;
}) {
  const [price, setPrice] = useState(String(product.price));
  const [stock, setStock] = useState(String(product.stock));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const dirty =
    price !== String(product.price) || stock !== String(product.stock);
  const low = product.stock <= LOW_STOCK;

  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      await updateProduct(token, product.id, {
        price: Number(price),
        stock: Number(stock),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async () => {
    setBusy(true);
    setErr("");
    try {
      await updateProduct(token, product.id, { is_active: !product.is_active });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li
      className={`rounded-xl border p-3 ${
        product.is_active
          ? "border-gray-200 dark:border-gray-700"
          : "border-gray-200 bg-gray-50 opacity-60 dark:border-gray-700 dark:bg-gray-900"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="font-semibold">
          {product.name}
          {low && product.is_active && (
            <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-600">
              残りわずか
            </span>
          )}
          {!product.is_active && (
            <span className="ml-2 text-xs text-gray-500">（停止中）</span>
          )}
        </p>
        <button
          onClick={toggleActive}
          disabled={busy}
          className="text-xs text-gray-500 underline"
        >
          {product.is_active ? "販売停止" : "再開"}
        </button>
      </div>
      <div className="mt-2 flex items-end gap-2">
        <label className="flex-1 text-xs text-gray-500">
          価格(円)
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="numeric"
            className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm dark:bg-gray-900"
          />
        </label>
        <label className="flex-1 text-xs text-gray-500">
          在庫
          <input
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            inputMode="numeric"
            className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm dark:bg-gray-900"
          />
        </label>
        <button
          onClick={save}
          disabled={busy || !dirty}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
        >
          保存
        </button>
      </div>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </li>
  );
}

function PaypayQrManager({
  token,
  qr,
  onDone,
}: {
  token: string;
  qr: PaypayQr | null;
  onDone: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null); // 新しく選んだ画像
  const [expires, setExpires] = useState(qr?.expiresAt ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setErr("");
    setOk(false);
    try {
      // 読み取りやすさを保ちつつ軽量化するため、最大600pxに縮小してから保存する
      setPreview(await fileToResizedDataUrl(file, 600));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const save = async () => {
    setBusy(true);
    setErr("");
    setOk(false);
    try {
      // 新しい画像を選んでいればそれを、なければ既存の画像を使う（＝期限だけ更新も可）
      const image = preview ?? qr?.imageDataUrl ?? null;
      if (!image) throw new Error("QR画像を選択してください");
      await setPaypayQr(token, image, expires || null);
      setPreview(null);
      setOk(true);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const dirty = preview !== null || expires !== (qr?.expiresAt ?? "");

  // 有効期限の状態（警告表示用）
  const days = qr?.expiresAt ? daysUntil(qr.expiresAt) : null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
      {/* 現在のQRと期限の状態 */}
      <div className="flex items-center gap-3">
        {qr?.imageDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qr.imageDataUrl}
            alt="現在のPayPay QR"
            className="h-20 w-20 rounded border border-gray-200 object-contain dark:border-gray-700"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded border-2 border-dashed border-gray-300 text-center text-[10px] text-gray-400">
            未登録
          </div>
        )}
        <div className="text-sm">
          {!qr?.imageDataUrl ? (
            <p className="text-gray-500">
              まだQRが登録されていません。
              <br />
              PayPayのマイコードを登録してください。
            </p>
          ) : days === null ? (
            <p className="text-amber-600">有効期限が未設定です</p>
          ) : days < 0 ? (
            <p className="font-semibold text-red-600">
              期限切れ（{-days}日前）
              <br />
              すぐにQRを更新してください
            </p>
          ) : days <= 3 ? (
            <p className="font-semibold text-amber-600">
              あと{days}日で期限切れ（{formatMD(qr.expiresAt!)}）
              <br />
              早めに更新してください
            </p>
          ) : (
            <p className="text-gray-500">
              有効期限：{formatMD(qr.expiresAt!)}
              <br />
              （あと{days}日）
            </p>
          )}
        </div>
      </div>

      <hr className="border-gray-100 dark:border-gray-800" />

      {/* 新しいQRの登録フォーム */}
      <p className="text-sm font-semibold">QRを更新する</p>
      <label className="text-xs text-gray-500">
        新しいマイコード画像
        <input
          type="file"
          accept="image/*"
          onChange={(e) => pickFile(e.target.files?.[0])}
          className="mt-0.5 block w-full text-sm"
        />
      </label>

      {preview && (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="新しいQRプレビュー"
            className="h-20 w-20 rounded border border-emerald-300 object-contain"
          />
          <span className="text-xs text-emerald-600">この画像に更新します</span>
        </div>
      )}

      <label className="text-xs text-gray-500">
        有効期限（PayPayの画面に表示されている日付）
        <input
          type="date"
          value={expires}
          onChange={(e) => setExpires(e.target.value)}
          className="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1 text-sm dark:bg-gray-900"
        />
      </label>

      <button
        onClick={save}
        disabled={busy || !dirty}
        className="rounded bg-emerald-600 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {busy ? "保存中..." : "保存する"}
      </button>

      {ok && <p className="text-xs text-emerald-600">更新しました ✓</p>}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-1 flex-col items-center justify-center p-6 text-center">
      {children}
    </main>
  );
}

/** 画像ファイルを最大maxピクセルに縮小し、PNGのdata URL文字列にする */
function fileToResizedDataUrl(file: File, max = 600): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("画像処理に失敗しました"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("画像を読み込めませんでした"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("ファイルを読み込めませんでした"));
    reader.readAsDataURL(file);
  });
}

/** 'YYYY-MM-DD' の日付が今日から何日後かを返す（過去なら負） */
function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/** 'YYYY-MM-DD' を 'M/D' 表記にする */
function formatMD(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}
