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

  if (!botData) return <div className="loading">Carregando Bot...</div>

  return (
    <div className="dashboard-container">
      <header>
        <h1>Bot Crypto Dashboard</h1>
        <span className="live-badge">AO VIVO</span>
      </header>

      <div className="cards-grid">
        <div className="card">
          <h3>Preço Atual (BTC)</h3>
          <p className="big-number">${botData.price?.toFixed(2)}</p>
        </div>


        <div className={`card ${botData.rsi > 70 ? 'danger' : 'safe'}`}>
          <h3>Indicador RSI</h3>
          <p className="big-number">{botData.rsi?.toFixed(2)}</p>
          <small>{botData.rsi > 70 ? "PERIGO: Sobrecomprado!" : "Zona Segura"}</small>
        </div>


        <div className={`card ${botData.isOpenned ? 'active' : 'inactive'}`}>
          <h3>Status da Posição</h3>
          <p className="status-text">
            {botData.isOpenned ? "COMPRADO" : "AGUARDANDO"}
          </p>
          {botData.isOpenned && (
             <p>Preço de Entrada: ${botData.buyPrice}</p>
          )}
        </div>
      </div>

      <div className="log-box">
        <h4>Último Log do Sistema:</h4>
        <p>{botData.lastLog}</p>
      </div>
    </div>
  )
}

export default App;