import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './ui/App'
import './ui/styles.css' // asegúrate de que SÍ esté en src/ui/

const el = document.getElementById('root')
if (!el) throw new Error('#root no existe en index.html')
createRoot(el).render(<App />)
