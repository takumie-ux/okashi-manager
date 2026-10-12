"use client";

import { useEffect, useState } from "react";
import { initAuth } from "@/lib/liff";
import {
  getAdminData,
  addProduct,
  updateProduct,
  setPurchasePaid,
  deletePurchase,
  deletePaidPurchases,
  deleteProduct,
  resetSoldCount,
  resetAllSoldCounts,
} from "@/lib/admin-actions";
import type { AdminData, Product } from "@/lib/types";

type Phase = "loading" | "ready" | "unauthorized" | "error";

const LOW_STOCK = 3; // これ以下で在庫僅少アラート

export default function AdminPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [token, setToken] = useState("");
  const [data, setData] = useState<AdminData | null>(null);
  const [msg, setMsg] = useState("");

  const load = async (tk: string) => {
    const res = await getAdminData(tk);
    if (!res.ok) {
      // 権限なし。例外ではなく戻り値で判定するので、本番ビルドでも確実に出し分けできる
      setPhase("unauthorized");
      return;
    }
    setData(res.data);
    setPhase("ready");
  };

  useEffect(() => {
    (async () => {
      try {
        const auth = await initAuth();
        setToken(auth.token);
        await load(auth.token);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : String(e));
        setPhase("error");
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
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-bold">商品管理</h2>
          <button
            onClick={async () => {
              const ok = window.confirm(
                "すべての商品を補充したものとして処理します。\n\n" +
                  "売れた分をそれぞれの在庫に戻し、販売数を0にします。\n" +
                  "購入履歴はそのまま残ります。\n\n" +
                  "よろしいですか？"
              );
              if (!ok) return;
              try {
                const r = await resetAllSoldCounts(token);
                setMsg(
                  `${r.reset}件の商品をリセットしました（在庫に合計${r.added}個を戻しました）`
                );
                reload();
              } catch (e) {
                setMsg(e instanceof Error ? e.message : String(e));
              }
            }}
            className="whitespace-nowrap rounded border border-gray-300 px-2 py-1 text-xs text-gray-500 dark:border-gray-600"
            title="売れた分をそれぞれの在庫に戻し、販売数を0にします"
          >
            すべてリセット
          </button>
        </div>
        <ul className="flex flex-col gap-2">
          {data.products.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              sold={data.soldByProduct[p.id] ?? 0}
              token={token}
              onDone={reload}
            />
          ))}
        </ul>
        <div className="mt-3">
          <AddProductForm token={token} onDone={reload} />
        </div>
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
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-bold">購入履歴（最新30件）</h2>
          <button
            onClick={async () => {
              const ok = window.confirm(
                "回収済みの購入記録をすべて削除します。\n\n" +
                  "未払いの記録は残ります。在庫は戻りません。\n" +
                  "削除した分は販売数からも差し引かれます。\n\n" +
                  "元に戻せません。よろしいですか？"
              );
              if (!ok) return;
              try {
                const r = await deletePaidPurchases(token);
                setMsg(`回収済みの記録を${r.deleted}件削除しました`);
                reload();
              } catch (e) {
                setMsg(e instanceof Error ? e.message : String(e));
              }
            }}
            className="whitespace-nowrap rounded border border-gray-300 px-2 py-1 text-xs text-gray-500 dark:border-gray-600"
            title="回収済みの記録をまとめて削除します（未払いは残ります）"
          >
            回収済みを一括削除
          </button>
        </div>
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
                <button
                  onClick={async () => {
                    const ok = window.confirm(
                      `${h.userName} さんの ¥${h.amount} の記録を削除します。

` +
                        `在庫は戻りません。この商品の累計販売数からも差し引かれます。
` +
                        `元に戻せません。よろしいですか？`
                    );
                    if (!ok) return;
                    try {
                      await deletePurchase(token, h.purchaseId);
                      reload();
                    } catch (e) {
                      setMsg(e instanceof Error ? e.message : String(e));
                    }
                  }}
                  className="ml-1 px-1 text-xs text-gray-400"
                  title="この購入記録を削除します（在庫は戻りません）"
                  aria-label="購入記録を削除"
                >
                  ✕
                </button>
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
  sold,
  token,
  onDone,
}: {
  product: Product;
  sold: number;
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

  // 補充したときに押す。売れた分を在庫に戻し、販売数を数え直す
  const resetSold = async () => {
    const ok = window.confirm(
      `${product.name} を補充したものとして処理します。\n\n` +
        `在庫  ${product.stock} → ${product.stock + sold}（売れた ${sold} 個を戻す）\n` +
        `販売数  ${sold} → 0\n\n` +
        `よろしいですか？`
    );
    if (!ok) return;
    setBusy(true);
    setErr("");
    try {
      await resetSoldCount(token, product.id);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = window.confirm(
      `${product.name} を削除します。元に戻せません。\nよろしいですか？`
    );
    if (!ok) return;
    setBusy(true);
    setErr("");
    try {
      const res = await deleteProduct(token, product.id);
      if (!res.ok) {
        setErr(
          "この商品には購入履歴があるため削除できません。販売停止にするか、先に履歴を削除してください。"
        );
        return;
      }
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
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-xs text-gray-500">
            累計{" "}
            <span className="font-semibold text-gray-700 dark:text-gray-300">
              {sold}
            </span>{" "}
            個
          </span>
          <button
            onClick={resetSold}
            disabled={busy}
            className="rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-500 dark:border-gray-600"
            title="補充したときに押すと、売れた分を在庫に戻して販売数を0にします"
          >
            リセット
          </button>
        </div>
      </div>
      <div className="mt-1 flex justify-end gap-3">
        <button
          onClick={toggleActive}
          disabled={busy}
          className="text-xs text-gray-500 underline"
        >
          {product.is_active ? "販売停止" : "再開"}
        </button>
        <button
          onClick={remove}
          disabled={busy}
          className="text-xs text-red-500 underline"
        >
          削除
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

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-1 flex-col items-center justify-center p-6 text-center">
      {children}
    </main>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}
