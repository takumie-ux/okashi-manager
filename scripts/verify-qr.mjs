// 保存されたPayPay QR画像(data URL)が正常なPNGかを検証する開発用スクリプト。
// 実行:  node --env-file=.env.local scripts/verify-qr.mjs

import { createClient } from "@supabase/supabase-js";

const baseUrl = new URL(process.env.SUPABASE_URL).origin;
const supabase = createClient(baseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await supabase
  .from("app_settings")
  .select("value")
  .eq("key", "paypay_qr_image")
  .maybeSingle();

if (error) {
  console.error("NG:", error.message);
  process.exit(1);
}
if (!data?.value) {
  console.log("画像が登録されていません（paypay_qr_image が空）");
  process.exit(0);
}

const v = data.value;
console.log("先頭:", v.slice(0, 40));
const m = v.match(/^data:(image\/\w+);base64,(.*)$/s);
if (!m) {
  console.log("NG: data URL の形式が不正です");
  process.exit(0);
}
const buf = Buffer.from(m[2], "base64");
const isPng =
  buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
console.log(`MIME: ${m[1]}`);
console.log(`デコード後サイズ: ${buf.length} バイト`);
console.log(`PNGとして正常: ${isPng ? "はい ✓" : "いいえ ✗"}`);
