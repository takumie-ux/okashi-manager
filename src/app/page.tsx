"use client";

import { useEffect, useState } from "react";
import { initAuth } from "@/lib/liff";
import { getProducts, submitPurchase, markPurchasePaid } from "@/lib/actions";
import type { Product } from "@/lib/types";

type Phase = "loading" | "shopping" | "paying" | "done" | "error";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [token, setToken] = useState("");
  const [userName, setUserName] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ purchaseId: string; total: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [qrError, setQrError] = useState(false);

  // 初期化：ログイン → 商品読み込み
  useEffect(() => {
    (async () => {
      try {
        const auth = await initAuth();
        setToken(auth.token);
        setUserName(auth.name);
        setProducts(await getProducts());
        setPhase("shopping");
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "初期化に失敗しました");
        setPhase("error");
      }
    })();
  }, []);

  const setQty = (id: string, qty: number) =>
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });

  const cartItems = products
    .map((p) => ({ product: p, qty: cart[p.id] ?? 0 }))
    .filter((x) => x.qty > 0);
  const total = cartItems.reduce((s, x) => s + x.product.price * x.qty, 0);

  const handlePurchase = async () => {
    setSubmitting(true);
    try {
      const items = cartItems.map((x) => ({ product_id: x.product.id, quantity: x.qty }));
      const res = await submitPurchase(token, items);
      setResult({ purchaseId: res.purchaseId, total: res.total });
      setPhase("paying");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "購入に失敗しました");
      setPhase("error");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaid = async () => {
    if (!result) return;
    setSubmitting(true);
    try {
      await markPurchasePaid(token, result.purchaseId);
      setPhase("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "支払い確認に失敗しました");
      setPhase("error");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = async () => {
    setCart({});
    setResult(null);
    setQrError(false);
    setPhase("loading");
    try {
      setProducts(await getProducts());
      setPhase("shopping");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "再読み込みに失敗しました");
      setPhase("error");
    }
  };

  // ---- 画面描画 ----

  if (phase === "loading") {
    return <Centered>読み込み中...</Centered>;
  }

  if (phase === "error") {
    return (
      <Centered>
        <p className="font-semibold text-red-600">エラーが発生しました</p>
        <p className="mt-2 text-sm text-gray-500">{errorMsg}</p>
        <button
          onClick={reset}
          className="mt-4 rounded-lg bg-gray-800 px-4 py-2 text-sm text-white"
        >
          最初からやり直す
        </button>
      </Centered>
    );
  }

  if (phase === "done") {
    return (
      <Centered>
        <p className="text-4xl">🎉</p>
        <p className="mt-3 font-semibold">ありがとうございました！</p>
        <p className="mt-1 text-sm text-gray-500">支払いを記録しました。</p>
        <button
          onClick={reset}
          className="mt-6 rounded-lg bg-gray-800 px-4 py-2 text-sm text-white"
        >
          続けて購入する
        </button>
      </Centered>
    );
  }

  if (phase === "paying" && result) {
    return (
      <main className="mx-auto flex min-h-full max-w-md flex-col gap-5 p-6">
        <h1 className="text-center text-xl font-bold">PayPayでお支払い</h1>

        <div className="rounded-xl bg-emerald-50 p-4 text-center dark:bg-emerald-950">
          <p className="text-sm text-gray-500">お支払い金額</p>
          <p className="mt-1 text-4xl font-bold text-emerald-600">¥{result.total}</p>
        </div>

        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
          {!qrError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/paypay-qr.png"
              alt="PayPay受け取りQR"
              onError={() => setQrError(true)}
              className="mx-auto h-56 w-56 object-contain"
            />
          ) : (
            <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-4 text-center text-xs text-gray-400">
              <span>
                <code>public/paypay-qr.png</code> に
                <br />
                PayPayの受け取りQR画像を
                <br />
                置くと、ここに表示されます
              </span>
            </div>
          )}
          <p className="mt-3 text-center text-sm text-gray-500">
            PayPayアプリでこのQRを読み取り、
            <br />
            <span className="font-semibold text-gray-700 dark:text-gray-300">
              ¥{result.total}
            </span>{" "}
            を送金してください。
          </p>
        </div>

        <button
          onClick={handlePaid}
          disabled={submitting}
          className="rounded-lg bg-emerald-600 py-3 font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "処理中..." : "支払いました"}
        </button>
        <p className="text-center text-xs text-gray-400">
          ※「支払いました」を押すと購入が完了します
        </p>
      </main>
    );
  }

  // phase === "shopping"
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col p-4 pb-32">
      <header className="py-3 text-center">
        <h1 className="text-xl font-bold">🍪 お菓子コーナー</h1>
        <p className="mt-1 text-xs text-gray-500">ようこそ、{userName} さん</p>
      </header>

      {products.length === 0 ? (
        <p className="mt-10 text-center text-sm text-gray-500">
          販売中の商品がありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {products.map((p) => {
            const qty = cart[p.id] ?? 0;
            const soldOut = p.stock <= 0;
            return (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-gray-200 p-3 dark:border-gray-700"
              >
                <div>
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-sm text-gray-500">
                    ¥{p.price}
                    <span className={`ml-2 ${soldOut ? "text-red-500" : ""}`}>
                      {soldOut ? "在庫なし" : `残り${p.stock}`}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQty(p.id, qty - 1)}
                    disabled={qty <= 0}
                    className="h-8 w-8 rounded-full border border-gray-300 text-lg disabled:opacity-30"
                    aria-label="減らす"
                  >
                    −
                  </button>
                  <span className="w-5 text-center">{qty}</span>
                  <button
                    onClick={() => setQty(p.id, qty + 1)}
                    disabled={soldOut || qty >= p.stock}
                    className="h-8 w-8 rounded-full border border-gray-300 text-lg disabled:opacity-30"
                    aria-label="増やす"
                  >
                    ＋
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 下部固定の会計バー */}
      {cartItems.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-black">
          <div className="mx-auto flex max-w-md items-center justify-between gap-4">
            <div>
              <p className="text-xs text-gray-500">合計</p>
              <p className="text-xl font-bold">¥{total}</p>
            </div>
            <button
              onClick={handlePurchase}
              disabled={submitting}
              className="flex-1 rounded-lg bg-emerald-600 py-3 font-semibold text-white disabled:opacity-50"
            >
              {submitting ? "処理中..." : "購入する"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-1 flex-col items-center justify-center p-6 text-center">
      {children}
    </main>
  );
}
