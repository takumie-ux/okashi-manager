"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { initAuth } from "@/lib/liff";
import { getProducts, submitPurchase, getMyRole } from "@/lib/actions";
import type { Product } from "@/lib/types";

// 支払いはアプリ内では行わない。購入を記録するところまでが購入者の操作で、
// 集金は管理者がLINEで催促し、LINEのPayPay送金で受け取る運用。
type Phase = "loading" | "shopping" | "done" | "error";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [token, setToken] = useState("");
  const [userName, setUserName] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ purchaseId: string; total: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false); // 管理画面への導線を出すかどうか

  // 初期化：ログイン → 商品読み込み
  useEffect(() => {
    (async () => {
      try {
        const auth = await initAuth();
        setToken(auth.token);
        setUserName(auth.name);
        const [prods, role] = await Promise.all([
          getProducts(),
          getMyRole(auth.token),
        ]);
        setProducts(prods);
        setIsAdmin(role.isAdmin);
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
      setPhase("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "購入に失敗しました");
      setPhase("error");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = async () => {
    setCart({});
    setResult(null);
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
        <p className="text-4xl">🍪</p>
        <p className="mt-3 font-semibold">ありがとうございました！</p>
        {result && (
          <p className="mt-3 text-4xl font-bold text-emerald-600">¥{result.total}</p>
        )}
        <p className="mt-3 text-sm text-gray-500">
          購入を記録しました。
          <br />
          お支払いは、あとでお菓子管理係から
          <br />
          LINEでご連絡します。
        </p>
        <button
          onClick={reset}
          className="mt-6 rounded-lg bg-gray-800 px-4 py-2 text-sm text-white"
        >
          続けて購入する
        </button>
      </Centered>
    );
  }

  // phase === "shopping"
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col p-4 pb-32">
      <header className="py-3 text-center">
        <h1 className="text-xl font-bold">🍪 お菓子コーナー</h1>
        <p className="mt-1 text-xs text-gray-500">ようこそ、{userName} さん</p>
        {isAdmin && (
          <Link
            href="/admin"
            className="mt-2 inline-block rounded-full border border-emerald-300 px-3 py-1 text-xs text-emerald-600"
          >
            🔧 管理画面へ
          </Link>
        )}
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
