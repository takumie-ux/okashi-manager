// アプリ全体で使う型定義

export type Product = {
  id: string;
  name: string;
  price: number;
  stock: number;
  image_url: string | null;
  is_active: boolean;
};

// 購入時にサーバー（RPC）へ渡す明細。キー名はDB関数の期待に合わせる。
export type CartItem = {
  product_id: string;
  quantity: number;
};

export type AppUser = {
  id: string;
  line_user_id: string;
  display_name: string;
  is_admin: boolean;
};

// --- 管理画面用 ---

export type UnpaidRow = {
  purchaseId: string;
  userName: string;
  amount: number;
  createdAt: string;
};

export type HistoryRow = UnpaidRow & { status: "unpaid" | "paid" };

export type AdminData = {
  products: Product[];
  stats: {
    totalPaid: number;
    totalUnpaid: number;
    productCount: number;
    totalStock: number;
  };
  unpaid: UnpaidRow[];
  history: HistoryRow[];
};

// 管理データ取得の結果。
// 権限不足を例外ではなく戻り値で表す。Next.jsの本番ビルドではサーバー側で投げた
// エラーメッセージがクライアントに渡らない（汎用メッセージとidentifierに置き換わる）ため、
// メッセージ文字列では「権限がないのか、別の障害なのか」を画面側で判別できないため。
export type AdminDataResult =
  | { ok: true; data: AdminData }
  | { ok: false; reason: "forbidden" };
