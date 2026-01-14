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
  return Number(str.replace(/[^\d]/g, ""));
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
// BIỂU ĐỒ (DOT + VERTICAL LINE)
// ===============================
function findChangeIndexes(history) {
  const idx = [];
  for (let i = 1; i < history.length; i++) {
    if (
      history[i].buy !== history[i - 1].buy ||
      history[i].sell !== history[i - 1].sell
    ) {
      idx.push(i);
    }
  }
  return idx;
}

function drawChart(history) {
  const width = 900;
  const height = 500;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // =====================
  // BACKGROUND
  // =====================
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);

  const buyPrices = history.map((h) => parsePrice(h.buy));
  const sellPrices = history.map((h) => parsePrice(h.sell));

  let min = Math.min(...buyPrices, ...sellPrices);
  let max = Math.max(...buyPrices, ...sellPrices);

  if (min === max) {
    min -= 1_000_000;
    max += 1_000_000;
  }

  const padding = 50;

  const y = (v) =>
    height - padding - ((v - min) / (max - min)) * (height - padding * 2);

  const xAt = (i, total) =>
    padding + (i / (total - 1)) * (width - padding * 2);

  // =====================
  // GRID (nhẹ)
  // =====================
  ctx.strokeStyle = "#eee";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const yy = padding + (i / 5) * (height - padding * 2);
    ctx.beginPath();
    ctx.moveTo(padding, yy);
    ctx.lineTo(width - padding, yy);
    ctx.stroke();
  }

  // =====================
  // DRAW LINE
  // =====================
  function drawLine(values, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    values.forEach((v, i) => {
      const xx = xAt(i, values.length);
      const yy = y(v);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();
  }

  drawLine(buyPrices, "green");
  drawLine(sellPrices, "red");

  // =====================
  // MARK CHANGE POINTS
  // =====================
  ctx.font = "11px sans-serif";

  for (let i = 1; i < history.length; i++) {
    const changed =
      history[i].buy !== history[i - 1].buy ||
      history[i].sell !== history[i - 1].sell;

    if (!changed) continue;

    const xx = xAt(i, history.length);

    // ---- vertical line
    ctx.strokeStyle = "#ccc";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(xx, padding);
    ctx.lineTo(xx, height - padding);
    ctx.stroke();
    ctx.setLineDash([]);

    // ---- buy label
    ctx.fillStyle = "green";
    ctx.fillText(
      buyPrices[i].toLocaleString("vi-VN"),
      xx + 5,
      y(buyPrices[i]) - 5
    );

    // ---- sell label
    ctx.fillStyle = "red";
    ctx.fillText(
      sellPrices[i].toLocaleString("vi-VN"),
      xx + 5,
      y(sellPrices[i]) + 12
    );

    // ---- DATE + TIME
    const [date, time] = history[i].time.split(" ");
    ctx.fillStyle = "#333";
    ctx.fillText(`${date}`, xx - 30, height - 30);
    ctx.fillText(`${time}`, xx - 20, height - 15);
  }

  // =====================
  // TITLE
  // =====================
  ctx.fillStyle = "#000";
  ctx.font = "16px sans-serif";
  ctx.fillText("📊 Biểu đồ giá vàng 98", padding, 30);

  fs.writeFileSync("chart.png", canvas.toBuffer());
}

// ===============================
// MAIN
// ===============================
async function main() {
  const price = await getGiaNhan98();
  const now = nowVN();

  let data = { buy: null, sell: null, lastHourlyNotifyHour: null };
  if (fs.existsSync("data.json"))
    data = JSON.parse(fs.readFileSync("data.json"));

  let history = [];
  if (fs.existsSync("history.json"))
    history = JSON.parse(fs.readFileSync("history.json"));

  history.push({
    time: formatTime(now),
    buy: price.buy,
    sell: price.sell,
  });

  fs.writeFileSync("history.json", JSON.stringify(history, null, 2));

  const changed =
    data.buy !== price.buy || data.sell !== price.sell;

  const hour = now.getHours();
  let message = null;
  let hourly = false;

  if (data.lastHourlyNotifyHour !== hour) {
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

    const last24 = history.slice(-24);
    if (last24.length >= 2) {
      drawChart(last24);
      await sendImage("chart.png", "📊 Biểu đồ giá vàng 98");
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