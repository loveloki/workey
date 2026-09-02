import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { getRouter } from './router'
import { I18nProvider } from './lib/i18n'
import './styles.css'

const router = getRouter()

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>
  </React.StrictMode>
)
