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

// PayPay受け取りQR（マイコード）の設定。画像はdata URL文字列で保存する。
export type PaypayQr = {
  imageDataUrl: string | null;
  expiresAt: string | null; // 'YYYY-MM-DD'。未設定ならnull
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
