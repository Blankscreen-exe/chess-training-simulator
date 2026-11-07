import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@lichess-org/chessground/assets/chessground.base.css'
import '@lichess-org/chessground/assets/chessground.brown.css'
import '@lichess-org/chessground/assets/chessground.cburnett.css'
import { App } from './App'
import './index.css'

const root = document.getElementById('root')
if (!root) {
  throw new Error('The page has no #root element to draw the app in')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
