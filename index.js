require('dotenv').config();
const crypto = require("crypto");
const axios = require("axios");
const fs = require("fs");

const SYMBOL = "BTCUSDT";
const QUANTITY = "0.001";
const API_KEY = process.env.API_KEY;
const SECRET_KEY = process.env.SECRET_KEY;
const API_URL = "https://testnet.binance.vision";

const STOP_LOSS_PERCENT = 0.02;
const TAKE_PROFIT_PERCENT = 0.05;
const RSI_PERIOD = 14;
const INTERVAL = "15m";

let isOpenned = false;
let buyPrice = 0;

function logToFile(type, price, reason, profit = 0) {
    const now = new Date().toLocaleString("pt-BR");
    let message = "";

    if (type === "COMPRA") {
        message = `[${now}] COMPRA  | Preço: ${price} | Motivo: ${reason}\n`;
    } else {
        message = `[${now}] VENDA   | Preço: ${price} | Motivo: ${reason} | Resultado: ${profit.toFixed(2)} USDT\n`;
    }

    fs.appendFileSync("trades_log.txt", message);
}

function calcSMA(data) {
    const closes = data.map(candle => parseFloat(candle[4]));
    const sum = closes.reduce((a, b) => a + b);
    return sum / data.length;
}

function calcRSI(data) {
    const closes = data.map(candle => parseFloat(candle[4]));
    let gains = 0;
    let losses = 0;

    for (let i = closes.length - RSI_PERIOD; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) gains += diff;
        else losses += Math.abs(diff);
    }

    const avgGain = gains / RSI_PERIOD;
    const avgLoss = losses / RSI_PERIOD;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

async function start() {
    try {
        const { data } = await axios.get(API_URL + "/api/v3/klines?limit=30&interval=" + INTERVAL + "&symbol=" + SYMBOL);
        
        const closedCandles = data.slice(0, data.length - 1); 
        
        const lastCandle = closedCandles[closedCandles.length - 1];
        const currentPrice = parseFloat(lastCandle[4]);

        console.clear();
        console.log("=== BOT CRYPTO ===");
        console.log("Preço Atual (Fechamento): " + currentPrice);

        const data21 = closedCandles.slice(-21); 
        const data13 = closedCandles.slice(-13); 
        const dataRSI = closedCandles.slice(-(RSI_PERIOD + 1)); 

        const sma21 = calcSMA(data21);
        const sma13 = calcSMA(data13);
        const rsi = calcRSI(dataRSI);

        console.log(`SMA (13): ${sma13.toFixed(2)} | SMA (21): ${sma21.toFixed(2)}`);
        console.log(`RSI (14): ${rsi.toFixed(2)}`);
        console.log(`Posição Aberta: ${isOpenned} ${isOpenned ? `(Preço Compra: ${buyPrice})` : ''}`);

        if (isOpenned) {
            let sellReason = null;

            if (currentPrice <= buyPrice * (1 - STOP_LOSS_PERCENT)) {
                sellReason = "Stop Loss";
            }
            else if (rsi > 70 && currentPrice > buyPrice) {
                sellReason = "Take Profit (RSI > 70)";
            }
            else if (sma13 < sma21) {
                sellReason = "Cruzamento de Médias";
            }

            if (sellReason) {
                console.log(`VENDENDO! Motivo: ${sellReason}`);
                await newOrder(SYMBOL, QUANTITY, "sell");
                
                const profit = (currentPrice - buyPrice) * parseFloat(QUANTITY);
                logToFile("VENDA", currentPrice, sellReason, profit);

                isOpenned = false;
                buyPrice = 0;
            }
        } 
        else {
            if (sma13 > sma21 && rsi < 70) {
                console.log("Sinal de Compra Detectado!");
                await newOrder(SYMBOL, QUANTITY, "buy");

                logToFile("COMPRA", currentPrice, "SMA13 > SMA21 e RSI < 70");

                isOpenned = true;
                buyPrice = currentPrice;
            } else {
                console.log("Aguardando oportunidade...");
            }
        }

    } catch (err) {
        console.error("Erro no loop principal:", err.message);
    }
}

async function newOrder(symbol, quantity, side) {
    const order = { symbol, quantity, side };
    order.type = "MARKET";
    order.timestamp = Date.now();

    const signature = crypto.createHmac("sha256", SECRET_KEY)
        .update(new URLSearchParams(order).toString())
        .digest("hex");

    order.signature = signature;

    try {
        const { data } = await axios.post(
            API_URL + "/api/v3/order",
            new URLSearchParams(order).toString(),
            { headers: { "X-MBX-APIKEY": API_KEY } }
        );

        console.log("ORDEM EXECUTADA: " + side);
    } catch (err) {
        console.error("Erro ao enviar ordem:", err.response ? err.response.data : err);
    }
}

setInterval(start, 3000);