import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import FormData from "form-data";
import { createCanvas } from "canvas";

const URL = "https://kimkhanhviethung.vn/tra-cuu-gia-vang.html";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ===============================
// HELPERS
// ===============================
function parsePrice(str) {
  return Number(str.replace(/\./g, ""));
}

function nowVN() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
  );
}

function formatTime(d) {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

// ===============================
// LẤY GIÁ
// ===============================
async function getGiaNhan98() {
  const res = await axios.get(URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  const $ = cheerio.load(res.data);

  let buy, sell;

  $("table tbody tr").each((_, el) => {
    const name = $(el).find("td").eq(0).text().trim();
    if (name.includes("Nhẫn Khâu 98")) {
      buy = $(el).find("td").eq(1).text().trim();
      sell = $(el).find("td").eq(2).text().trim();
    }
  });

  if (!buy || !sell) throw new Error("Không tìm thấy giá");

  return { buy, sell };
}

// ===============================
// TELEGRAM
// ===============================
async function sendMessage(text) {
  await axios.post(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    { chat_id: TELEGRAM_CHAT_ID, text }
  );
}

async function sendImage(path, caption) {
  const form = new FormData();
  form.append("chat_id", TELEGRAM_CHAT_ID);
  form.append("caption", caption);
  form.append("photo", fs.createReadStream(path));

  await axios.post(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
    form,
    { headers: form.getHeaders() }
  );
}

// ===============================
// VẼ BIỂU ĐỒ
// ===============================
function drawChart(history) {
  const width = 900;
  const height = 500;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);

  const pricesBuy = history.map((h) => parsePrice(h.buy));
  const pricesSell = history.map((h) => parsePrice(h.sell));

  let min = Math.min(...pricesBuy, ...pricesSell);
  let max = Math.max(...pricesBuy, ...pricesSell);

  if (min === max) {
    min = min - 1_000_000;
    max = max + 1_000_000;
  }

  function y(v) {
    return (
      height - 50 - ((v - min) / (max - min)) * (height - 100)
    );
  }

  function drawLine(values, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = 50 + (i / (values.length - 1)) * (width - 100);
      const yy = y(v);
      if (i === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    });
    ctx.stroke();
  }

  drawLine(pricesBuy, "green");
  drawLine(pricesSell, "red");

  fs.writeFileSync("chart.png", canvas.toBuffer());
}

// ===============================
// MAIN
// ===============================
async function main() {
  const price = await getGiaNhan98();
  const now = nowVN();

  // ---- data.json
  let data = { buy: null, sell: null, lastHourlyNotifyHour: null };
  if (fs.existsSync("data.json")) {
    data = JSON.parse(fs.readFileSync("data.json"));
  }

  // ---- history.json
  let history = [];
  if (fs.existsSync("history.json")) {
    history = JSON.parse(fs.readFileSync("history.json"));
  }

  history.push({
    time: formatTime(now),
    buy: price.buy,
    sell: price.sell,
  });

  fs.writeFileSync("history.json", JSON.stringify(history, null, 2));

  const changed =
    data.buy !== price.buy || data.sell !== price.sell;

  const hour = now.getHours();
  const minute = now.getMinutes();

  let message = null;
  let hourly = false;

  if (minute < 5 && data.lastHourlyNotifyHour !== hour) {
    message = `📢 GIÁ VÀNG 98 HIỆN TẠI

Mua: ${price.buy}
Bán: ${price.sell}

⏰ ${now.toLocaleString("vi-VN")}`;
    hourly = true;
  } else if (changed) {
    message = `📢 GIÁ VÀNG 98 CÓ SỰ THAY ĐỔI

🔻 Giá cũ:
Mua: ${data.buy || "—"}
Bán: ${data.sell || "—"}

🔺 Giá mới:
Mua: ${price.buy}
Bán: ${price.sell}

⏰ ${now.toLocaleString("vi-VN")}`;
  }

  if (message) {
    await sendMessage(message);

    // vẽ + gửi biểu đồ 24 điểm gần nhất
    const last24 = history.slice(-24);
    if (last24.length >= 2) {
      drawChart(last24);
      await sendImage(
        "chart.png",
        "📊 Biểu đồ giá vàng 98 (gần nhất)"
      );
    }
  }

  fs.writeFileSync(
    "data.json",
    JSON.stringify(
      {
        buy: price.buy,
        sell: price.sell,
        lastHourlyNotifyHour: hourly
          ? hour
          : data.lastHourlyNotifyHour,
      },
      null,
      2
    )
  );
}

main();
