import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

const URL = "https://kimkhanhviethung.vn/tra-cuu-gia-vang.html";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = "5495863772";

// ===============================
// LẤY GIÁ VÀNG NHẪN 98
// ===============================
async function getGiaNhan98() {
  const res = await axios.get(URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
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

  let data = {
    buy: null,
    sell: null,
    lastHourlyNotifyHour: null,
  };

  if (fs.existsSync("data.json")) {
    data = JSON.parse(fs.readFileSync("data.json", "utf8"));
  }

  const oldPrice = {
    buy: data.buy,
    sell: data.sell,
  };

  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
  );

  const hour = now.getHours();
  const minute = now.getMinutes();

  const priceChanged =
    oldPrice.buy !== newPrice.buy || oldPrice.sell !== newPrice.sell;

  let message = null;
  let isHourlyNotify = false;

  // ===============================
  // BÁO GIÁ ĐỊNH KỲ MỖI 1 TIẾNG
  // ===============================
  if (
    minute < 5 && // cron 5 phút → chỉ 1 lần trong đầu giờ
    data.lastHourlyNotifyHour !== hour
  ) {
    message = `
📢 GIÁ VÀNG 98 Ở THỜI ĐIỂM HIỆN TẠI

Mua: ${newPrice.buy}
Bán: ${newPrice.sell}

⏰ ${now.toLocaleString("vi-VN")}
`;
    isHourlyNotify = true;
  }

  // ===============================
  // BÁO KHI GIÁ THAY ĐỔI
  // ===============================
  else if (priceChanged) {
    message = `
📢 GIÁ VÀNG 98 CÓ SỰ THAY ĐỔI

🔻 Giá cũ:
Mua: ${oldPrice.buy || "—"}
Bán: ${oldPrice.sell || "—"}

🔺 Giá mới:
Mua: ${newPrice.buy}
Bán: ${newPrice.sell}

⏰ ${now.toLocaleString("vi-VN")}
`;
  }

  if (message) {
    await sendTelegram(message.trim());
    console.log("✅ Đã gửi Telegram");
  } else {
    console.log("ℹ️ Không có thông báo");
  }

  // ===============================
  // LƯU DATA
  // ===============================
  fs.writeFileSync(
    "data.json",
    JSON.stringify(
      {
        buy: newPrice.buy,
        sell: newPrice.sell,
        lastHourlyNotifyHour: isHourlyNotify
          ? hour
          : data.lastHourlyNotifyHour,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("❌ Lỗi:", err.message);
  process.exit(1);
});
