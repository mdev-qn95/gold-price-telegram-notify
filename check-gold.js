import fs from "fs";
import axios from "axios";
import * as cheerio from "cheerio";

const URL = "https://kimkhanhviethung.vn/tra-cuu-gia-vang.html";
const DATA_FILE = "data.json";

/**
 * Lấy giá Vàng Nhẫn Khâu 98
 */
async function getGiaNhan98() {
  const { data } = await axios.get(URL, { timeout: 20000 });
  const $ = cheerio.load(data);

  let result = null;

  $("table tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.eq(0).text().includes("Vàng Nhẫn Khâu 98")) {
      result = {
        mua: tds.eq(1).text().trim(),
        ban: tds.eq(2).text().trim(),
      };
    }
  });

  return result;
}

/**
 * Gửi tin Telegram
 */
async function sendTelegram(text) {
  const token = process.env.TG_BOT_TOKEN;
  const chatId = 5495863772; // CHAT_ID của bạn

  if (!token) {
    throw new Error("❌ Thiếu TG_BOT_TOKEN");
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  await axios.post(url, {
    chat_id: chatId,
    text,
  });
}

(async () => {
  const newPrice = await getGiaNhan98();
  if (!newPrice) {
    console.log("❌ Không lấy được giá");
    return;
  }

  let oldPrice = null;
  if (fs.existsSync(DATA_FILE)) {
    oldPrice = JSON.parse(fs.readFileSync(DATA_FILE));
  }

  const changed =
    !oldPrice || oldPrice.mua !== newPrice.mua || oldPrice.ban !== newPrice.ban;

  if (!changed) {
    console.log("⏳ Giá chưa thay đổi");
    return;
  }

  const message = `📢 GIÁ VÀNG NHẪN KHÂU 98 CẬP NHẬT

🔴 Giá cũ:
${oldPrice ? `Mua ${oldPrice.mua} | Bán ${oldPrice.ban}` : "Chưa có dữ liệu"}

🟢 Giá mới:
Mua ${newPrice.mua} | Bán ${newPrice.ban}

⏰ ${new Date().toLocaleString("vi-VN")}`;

  await sendTelegram(message);

  fs.writeFileSync(DATA_FILE, JSON.stringify(newPrice, null, 2));
  console.log("✅ Đã gửi Telegram & lưu giá mới");
})();

