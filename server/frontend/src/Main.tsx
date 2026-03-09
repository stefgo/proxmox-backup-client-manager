import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './features/app/App';
import '@stefgo/react-ui-components/styles.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
