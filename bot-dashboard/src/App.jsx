import { useState, useEffect } from 'react'
import axios from 'axios'
import './App.css'

function App() {
  const [botData, setBotData] = useState(null)

  async function fetchBotStatus() {
    try {
      const response = await axios.get('http://localhost:3001/status')
      setBotData(response.data)
    } catch (error) {
      console.error("Erro ao buscar dados:", error)
    }
  }

  useEffect(() => {
    fetchBotStatus()
    const interval = setInterval(fetchBotStatus, 3000)
    return () => clearInterval(interval)
  }, [])

  if (!botData) return <div style={{color: 'white', textAlign: 'center', marginTop: '50px'}}>Conectando ao Bot...</div>

  const isScalping = botData.strategy === "SCALPING";

  const isDanger = isScalping 
    ? botData.price <= botData.lowerBand
    : botData.rsi > 70;

  return (
    <div className="dashboard-container">
      <header>
        <div>
          <h1>Bot Crypto Dashboard</h1>
          <span className="strategy-badge">
             MODO: {isScalping ? "SCALPING (Lateral)" : "TENDÊNCIA (Alta)"}
          </span>
        </div>
        <div className="live-badge">
          <div className="pulsing-dot"></div>
          AO VIVO
        </div>
      </header>

      <div className="cards-grid">
        <div className="card">
          <h3>Preço Bitcoin (BTC)</h3>
          <p className="big-number">${botData.price?.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
        </div>

        <div className={`card ${isDanger ? 'danger' : 'safe'}`}>
          <h3>{isScalping ? "Alvo de Compra (Bollinger)" : "Indicador RSI"}</h3>
          
          <p className="big-number">
            {isScalping 
              ? `$${botData.lowerBand?.toFixed(2)}`
              : botData.rsi?.toFixed(2) 
            }
          </p>
          
          <span className="sub-text" style={{color: isDanger ? '#f6465d' : '#0ecb81'}}>
            {isScalping 
              ? (botData.price <= botData.lowerBand ? "[SINAL] OPORTUNIDADE DE COMPRA" : "Aguardando tocar no fundo...")
              : (botData.rsi > 70 ? "[ALERTA] SOBRECOMPRADO" : "[OK] ZONA NEUTRA")
            }
          </span>
        </div>

        <div className={`card ${botData.isOpenned ? 'active' : 'inactive'}`}>
          <h3>Status da Carteira</h3>
          <p className="status-text">
            {botData.isOpenned ? "COMPRADO" : "LÍQUIDO"}
          </p>
          <span className="sub-text">
            {botData.isOpenned 
              ? `Entrada: $${botData.buyPrice}` 
              : isScalping ? `Teto (Venda): $${botData.upperBand?.toFixed(2)}` : "Aguardando sinal..."}
          </span>
        </div>
      </div>

      <div className="log-box">
        <h4>Terminal Output_</h4>
        <div className="log-content">
          <span style={{color: '#555'}}>
            {new Date().toLocaleTimeString()} &gt; 
          </span> 
          {' ' + botData.lastLog}
        </div>
      </div>
    </div>
  )
}

export default App;