// 入口QRコード（お菓子コーナーに掲示するQR）のPNGを生成する。
// 実行:  node scripts/make-qr.mjs "<URL>" [出力ファイル名]
//   例:  node scripts/make-qr.mjs "https://liff.line.me/0000000000-abcdefgh" entry-qr.png

import QRCode from "qrcode";

const url = process.argv[2];
const out = process.argv[3] || "entry-qr.png";

if (!url) {
  console.error("使い方: node scripts/make-qr.mjs \"<URL>\" [出力ファイル名]");
  process.exit(1);
}

await QRCode.toFile(out, url, {
  width: 900,
  margin: 2,
  errorCorrectionLevel: "M",
});

console.log(`✅ QRコードを生成しました: ${out}`);
console.log(`   内容: ${url}`);
