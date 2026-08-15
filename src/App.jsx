import React, { useState, useEffect, useRef } from 'react';
import PatientView from './components/PatientView';
import ReceptionistView from './components/ReceptionistView';
import DoctorView from './components/DoctorView';
import AuthView from './components/AuthView';
import SubscriptionLockout from './components/SubscriptionLockout';

export default function App() {
  const [route, setRoute] = useState(window.location.pathname);
  const [receptionistToken, setReceptionistToken] = useState(
    localStorage.getItem('queueless_receptionist_token')
  );
  const [doctorToken, setDoctorToken] = useState(
    localStorage.getItem('queueless_doctor_token')
  );

  // Centralized State
  const [clinicState, setClinicState] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const wsRef = useRef(null);

  // Simple client-side SPA routing listener
  useEffect(() => {
    const handleLocationChange = () => {
      setRoute(window.location.pathname);
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  // Fetch initial state and start WebSocket sync on mount
  useEffect(() => {
    const fetchInitialState = async () => {
      try {
        const response = await fetch('/api/queue');
        const state = await response.json();
        setClinicState(state);
      } catch (err) {
        console.error('Failed to load initial queue:', err);
        setError('Connection failed. Retrying...');
      } finally {
        setLoading(false);
      }
    };

    fetchInitialState();
    connectWebSocket();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      setError('');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'INITIAL_STATE' || data.type === 'UPDATE') {
          setClinicState(data.state);
        }
      } catch (err) {
        console.error('WS JSON parse error:', err);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (err) => {
      console.error('WS Error:', err);
      ws.close();
    };
  };

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setRoute(path);
  };

  const handleReceptionistLogin = (token) => {
    setReceptionistToken(token);
  };

  const handleReceptionistLogout = () => {
    localStorage.removeItem('queueless_receptionist_token');
    setReceptionistToken(null);
  };

  const handleDoctorLogin = (token) => {
    setDoctorToken(token);
  };

  const handleDoctorLogout = () => {
    localStorage.removeItem('queueless_doctor_token');
    setDoctorToken(null);
  };

  if (loading) {
    return (
      <div className="main-content">
        <div className="spinner" style={{ marginTop: '80px' }} />
        <p style={{ marginTop: '16px' }}>Initializing smart queue...</p>
      </div>
    );
  }

  // GLOBAL LOCKOUT GATE:
  // If the trial has expired, intercept and render lockout block globally.
  if (clinicState?.is_expired) {
    return (
      <SubscriptionLockout 
        clinicName={clinicState.clinic_name} 
      />
    );
  }

  // Route resolver
  const renderContent = () => {
    if (route === '/receptionist') {
      if (receptionistToken) {
        return (
          <ReceptionistView 
            token={receptionistToken} 
            onLogout={handleReceptionistLogout} 
            clinicState={clinicState}
            wsConnected={wsConnected}
          />
        );
      } else {
        return (
          <AuthView 
            role="receptionist" 
            onLoginSuccess={handleReceptionistLogin} 
          />
        );
      }
    }
    
    if (route === '/doctor') {
      if (doctorToken) {
        return (
          <DoctorView 
            token={doctorToken} 
            onLogout={handleDoctorLogout} 
            clinicState={clinicState}
            wsConnected={wsConnected}
          />
        );
      } else {
        return (
          <AuthView 
            role="doctor" 
            onLoginSuccess={handleDoctorLogin} 
          />
        );
      }
    }

    // Default route: Patient screen
    return (
      <PatientView 
        clinicState={clinicState} 
        wsConnected={wsConnected}
      />
    );
  };

  return (
    <div className="app-container">
      {renderContent()}

      {/* Navigation Helper Footer */}
      <footer style={{
        padding: '16px',
        textAlign: 'center',
        fontSize: '12px',
        color: 'var(--text-light)',
        borderTop: '1px solid var(--border-color)',
        backgroundColor: '#FAF9F6',
        marginTop: 'auto',
        zIndex: 10 // Stay below lockout modals
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <button 
            onClick={() => navigate('/')} 
            className="btn-outline" 
            style={{ padding: '4px 10px', fontSize: '11px', minHeight: 'auto' }}
          >
            📱 Patient View
          </button>
          <button 
            onClick={() => navigate('/receptionist')} 
            className="btn-outline" 
            style={{ padding: '4px 10px', fontSize: '11px', minHeight: 'auto' }}
          >
            📋 Receptionist View
          </button>
          <button 
            onClick={() => navigate('/doctor')} 
            className="btn-outline" 
            style={{ padding: '4px 10px', fontSize: '11px', minHeight: 'auto' }}
          >
            🩺 Doctor View
          </button>
        </div>
        <p style={{ marginTop: '8px', fontSize: '10px' }}>
          QueueLess v1.0.0 © {new Date().getFullYear()} — Tap views above to switch mock terminals
        </p>
      </footer>
    </div>
  );
}
