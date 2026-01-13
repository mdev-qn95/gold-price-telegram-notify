import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

const URL = "https://kimkhanhviethung.vn/tra-cuu-gia-vang.html";

// LẤY TỪ GITHUB SECRETS
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = "5495863772";

// ===============================
// LẤY GIÁ NHẪN KHÂU 98
// ===============================
async function getGiaNhan98() {
  const res = await axios.get(URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: "https://kimkhanhviethung.vn/",
    },
    timeout: 20000,
  });

  const $ = cheerio.load(res.data);

  let buy = null;
  let sell = null;

  $("table tbody tr").each((_, el) => {
    const name = $(el).find("td").eq(0).text().trim();
    if (name.includes("Nhẫn Khâu 98")) {
      buy = $(el).find("td").eq(1).text().trim();
      sell = $(el).find("td").eq(2).text().trim();
    }
  });

  if (!buy || !sell) {
    throw new Error("Không tìm thấy giá Nhẫn Khâu 98");
  }

  return { buy, sell };
}

// ===============================
// KIỂM TRA GIỜ BÁO CỐ ĐỊNH
// ===============================
function isFixedTime(dateVN) {
  const hour = dateVN.getHours();
  const minute = dateVN.getMinutes();

  // cron 10 phút/lần → chỉ gửi trong 10 phút đầu giờ
  return (
    minute < 10 &&
    (hour === 7 || hour === 12 || hour === 19)
  );
}

// ===============================
// GỬI TELEGRAM
// ===============================
async function sendTelegram(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await axios.post(url, {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
  });
}

// ===============================
// MAIN
// ===============================
async function main() {
  const newPrice = await getGiaNhan98();

  let oldPrice = null;
  if (fs.existsSync("data.json")) {
    oldPrice = JSON.parse(fs.readFileSync("data.json", "utf8"));
  }

  // Giờ Việt Nam
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
  );

  const fixedTime = isFixedTime(now);

  const priceChanged =
    !oldPrice ||
    oldPrice.buy !== newPrice.buy ||
    oldPrice.sell !== newPrice.sell;

  // QUYẾT ĐỊNH GỬI TELEGRAM
  if (fixedTime || priceChanged) {
    const message = `
📢 GIÁ VÀNG NHẪN KHÂU 98

${fixedTime && !priceChanged ? "⏰ Báo giá định kỳ" : ""}
${priceChanged ? "🔔 Có thay đổi giá" : ""}

Mua: ${newPrice.buy}
Bán: ${newPrice.sell}

⏰ ${now.toLocaleString("vi-VN")}
`;

    await sendTelegram(message.trim());
    console.log("✅ Đã gửi Telegram");
  } else {
    console.log("ℹ️ Không gửi (không đổi giá & ngoài giờ cố định)");
  }

  // LUÔN LƯU GIÁ MỚI
  fs.writeFileSync("data.json", JSON.stringify(newPrice, null, 2));
}

main().catch((err) => {
  console.error("❌ Lỗi:", err.message);
  process.exit(1);
});
