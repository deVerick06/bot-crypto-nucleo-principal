require('dotenv').config();
const crypto = require("crypto");
const axios = require("axios");
const fs = require("fs");
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

const SYMBOL = "BTCUSDT";
const QUANTITY = "0.001";
const API_KEY = process.env.API_KEY;
const SECRET_KEY = process.env.SECRET_KEY;
const API_URL = "https://testnet.binance.vision";
const INTERVAL = "15m";

const STRATEGY_TYPE = "SCALPING"; 


const STOP_LOSS_TREND = 0.02;
const RSI_MAX_ENTRY = 50; 

const STOP_LOSS_SCALP = 0.01;
const BOLLINGER_PERIOD = 20;
const BOLLINGER_MULTIPLIER = 2;

let isOpenned = false;
let buyPrice = 0;

let publicData = {
    price: 0,
    rsi: 0,
    sma13: 0,
    sma21: 0,
    upperBand: 0,
    lowerBand: 0,
    strategy: STRATEGY_TYPE,
    isOpenned: false,
    buyPrice: 0,
    lastLog: "Iniciando sistema..."
};

app.get('/status', (req, res) => {
    res.json(publicData);
});

app.listen(3001, () => {
    console.log(`Servidor rodando na porta 3001 | Modo: ${STRATEGY_TYPE}`);
});


function logToFile(type, price, reason, profit = 0) {
    const now = new Date().toLocaleString("pt-BR");
    let message = "";
    if (type === "COMPRA") {
        message = `[${now}] COMPRA (${STRATEGY_TYPE}) | Preço: ${price} | Motivo: ${reason}\n`;
    } else {
        message = `[${now}] VENDA (${STRATEGY_TYPE})  | Preço: ${price} | Motivo: ${reason} | Resultado: ${profit.toFixed(2)} USDT\n`;
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
    for (let i = closes.length - 14; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) gains += diff;
        else losses += Math.abs(diff);
    }
    const avgGain = gains / 14;
    const avgLoss = losses / 14;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function calcBollinger(data, period, multiplier) {
    const closes = data.slice(-period).map(c => parseFloat(c[4]));
    const sum = closes.reduce((a, b) => a + b, 0);
    const sma = sum / period;
    const variance = closes.reduce((a, c) => a + Math.pow(c - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    return {
        middle: sma,
        upper: sma + (stdDev * multiplier),
        lower: sma - (stdDev * multiplier)
    };
}

async function start() {
    try {
        const { data } = await axios.get(API_URL + "/api/v3/klines?limit=40&interval=" + INTERVAL + "&symbol=" + SYMBOL);
        
        const closedCandles = data.slice(0, data.length - 1); 
        const lastCandle = closedCandles[closedCandles.length - 1];
        const currentPrice = parseFloat(lastCandle[4]);

        const data21 = closedCandles.slice(-21); 
        const data13 = closedCandles.slice(-13); 
        const dataRSI = closedCandles.slice(-15); 
        const sma21 = calcSMA(data21);
        const sma13 = calcSMA(data13);
        const rsi = calcRSI(dataRSI);

        const bb = calcBollinger(closedCandles, BOLLINGER_PERIOD, BOLLINGER_MULTIPLIER);

        publicData = {
            price: currentPrice,
            rsi: rsi,
            sma13: sma13,
            sma21: sma21,
            upperBand: bb.upper,
            lowerBand: bb.lower,
            strategy: STRATEGY_TYPE,
            isOpenned: isOpenned,
            buyPrice: buyPrice,
            lastLog: STRATEGY_TYPE === "TREND" 
                ? `Tendência: SMA13 ${sma13 > sma21 ? '>' : '<'} SMA21 | RSI: ${rsi.toFixed(2)}`
                : `Scalping: Preço ${currentPrice} vs Fundo ${bb.lower.toFixed(2)}`
        };

        console.clear();
        console.log(`=== BOT CRYPTO HÍBRIDO [${STRATEGY_TYPE}] ===`);
        console.log(`Preço: ${currentPrice} | RSI: ${rsi.toFixed(2)}`);
        
        if(STRATEGY_TYPE === "SCALPING") {
            console.log(`Bollinger: Teto ${bb.upper.toFixed(2)} | Fundo ${bb.lower.toFixed(2)}`);
        } else {
            console.log(`Médias: SMA13 ${sma13.toFixed(2)} | SMA21 ${sma21.toFixed(2)}`);
        }
        
        console.log(`Posição: ${isOpenned ? "COMPRADO" : "LÍQUIDO"}`);

        if (isOpenned) {
            let sellReason = null;

            if (STRATEGY_TYPE === "TREND") {
                if (currentPrice <= buyPrice * (1 - STOP_LOSS_TREND)) sellReason = "Stop Loss (Trend)";
                else if (rsi > 70 && currentPrice > buyPrice) sellReason = "Take Profit (RSI > 70)";
                else if (sma13 < sma21) sellReason = "Cruzamento Médias (Fim Tendência)";
            
            } else if (STRATEGY_TYPE === "SCALPING") {
                if (currentPrice <= buyPrice * (1 - STOP_LOSS_SCALP)) sellReason = "Stop Loss (Scalp)";
                else if (currentPrice >= bb.upper) sellReason = "Alvo Atingido (Topo do Canal)";
                else if (currentPrice >= bb.middle && currentPrice > buyPrice) sellReason = "Retorno à Média (Lucro Seguro)";
            }

            if (sellReason) {
                console.log(`VENDENDO! Motivo: ${sellReason}`);
                await newOrder(SYMBOL, QUANTITY, "sell");
                const profit = (currentPrice - buyPrice) * parseFloat(QUANTITY);
                logToFile("VENDA", currentPrice, sellReason, profit);
                
                isOpenned = false;
                buyPrice = 0;
                publicData.isOpenned = false;
                publicData.lastLog = `VENDA: ${sellReason}`;
            }

        } else {
            if (STRATEGY_TYPE === "TREND") {
                if (sma13 > sma21 && rsi < RSI_MAX_ENTRY) {
                    await executeBuy(currentPrice, "SMA13 > SMA21 e RSI < 50");
                } else {
                    console.log("Aguardando Tendência + Desconto...");
                }

            } else if (STRATEGY_TYPE === "SCALPING") {
                if (currentPrice <= bb.lower) {
                    await executeBuy(currentPrice, "Preço tocou fundo de Bollinger");
                } else {
                    console.log("Aguardando preço tocar no fundo do canal...");
                }
            }
        }

    } catch (err) {
        console.error("Erro:", err.message);
    }
}

async function executeBuy(price, reason) {
    console.log("Sinal de Compra Detectado!");
    await newOrder(SYMBOL, QUANTITY, "buy");
    logToFile("COMPRA", price, reason);
    
    isOpenned = true;
    buyPrice = price;
    publicData.isOpenned = true;
    publicData.buyPrice = price;
    publicData.lastLog = `COMPRA! ${reason}`;
}

async function newOrder(symbol, quantity, side) {
    const order = { symbol, quantity, side, type: "MARKET", timestamp: Date.now() };
    const signature = crypto.createHmac("sha256", SECRET_KEY).update(new URLSearchParams(order).toString()).digest("hex");
    order.signature = signature;
    try {
        await axios.post(API_URL + "/api/v3/order", new URLSearchParams(order).toString(), { headers: { "X-MBX-APIKEY": API_KEY } });
    } catch (err) {
        console.error("Erro Order:", err.response ? err.response.data : err);
    }
}

setInterval(start, 3000);