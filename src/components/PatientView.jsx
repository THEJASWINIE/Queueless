import React, { useState, useEffect, useRef } from 'react';
import QueueIllustration from './QueueIllustration';
import '../styles/patient.css';

// Synthesize a soft arpeggio chime using Web Audio API
function playNotificationSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    const now = ctx.currentTime;
    const frequencies = [523.25, 659.25, 783.99]; 
    
    frequencies.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + index * 0.12);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + index * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.12 + 0.5);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now + index * 0.12);
      osc.stop(now + index * 0.12 + 0.6);
    });
  } catch (err) {
    console.warn('Audio feedback could not be played:', err);
  }
}

export default function PatientView({ clinicState, wsConnected }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [currentToken, setCurrentToken] = useState(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  
  const prevStatusRef = useRef(null);

  // Sync token from centralized state
  useEffect(() => {
    if (!clinicState || !clinicState.queue) return;
    const savedTokenId = localStorage.getItem('queueless_patient_token_id');
    
    if (savedTokenId) {
      const found = clinicState.queue.find(t => t.id === savedTokenId);
      if (found) {
        setCurrentToken(found);
        
        // Detect transition to 'in_progress' (patient called)
        const oldStatus = prevStatusRef.current;
        const newStatus = found.status;
        
        if (newStatus === 'in_progress' && oldStatus !== 'in_progress') {
          playNotificationSound();
          if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200, 100, 400]);
          }
        }
        prevStatusRef.current = newStatus;
      } else {
        // Token was deleted, cancelled, or expired
        setCurrentToken(null);
        localStorage.removeItem('queueless_patient_token_id');
      }
    } else {
      setCurrentToken(null);
    }
  }, [clinicState]);

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setJoining(true);
    setError('');
    playNotificationSound(); // Initialize audio context on tap

    try {
      const response = await fetch('/api/queue/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone }),
      });
      const data = await response.json();

      if (data.success && data.token) {
        setCurrentToken(data.token);
        prevStatusRef.current = data.token.status;
        localStorage.setItem('queueless_patient_token_id', data.token.id);
      } else {
        setError(data.error || 'Failed to join queue.');
      }
    } catch (err) {
      setError('Connection failed. Please check internet connection.');
    } finally {
      setJoining(false);
    }
  };

  const handleLeaveQueue = async () => {
    if (!currentToken) return;

    const confirmLeave = window.confirm('Are you sure you want to leave the queue? This will cancel your token.');
    if (!confirmLeave) return;

    try {
      const response = await fetch('/api/queue/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentToken.id })
      });
      if (response.ok) {
        setCurrentToken(null);
        localStorage.removeItem('queueless_patient_token_id');
      }
    } catch (err) {
      console.error('Failed to cancel token:', err);
    }
  };

  const handleRejoin = () => {
    setCurrentToken(null);
    localStorage.removeItem('queueless_patient_token_id');
    setName('');
    setPhone('');
  };

  const calculateQueueDetails = () => {
    if (!currentToken || !clinicState || !clinicState.queue) {
      return { peopleAhead: 0, waitTime: 0 };
    }

    const myTokenNum = currentToken.token_number;
    const peopleAhead = clinicState.queue.filter(
      t => t.status === 'waiting' && t.token_number < myTokenNum
    ).length;

    const avgServiceTime = clinicState.stats.avg_service_time_seconds || 300;
    const isDoctorBusy = clinicState.doctor_status === 'With patient';
    
    const activeMultiplier = peopleAhead + (isDoctorBusy ? 1 : 0);
    const waitTime = Math.max(1, Math.round((activeMultiplier * avgServiceTime) / 60));

    return { peopleAhead, waitTime };
  };

  if (!clinicState) {
    return (
      <div className="main-content">
        <div className="spinner" style={{ marginTop: '80px' }} />
        <p style={{ marginTop: '16px' }}>Connecting to clinic queue...</p>
      </div>
    );
  }

  const { peopleAhead, waitTime } = calculateQueueDetails();

  return (
    <div className="main-content">
      <div className="patient-layout">
        
        <div className="clinic-header">
          <h1>{clinicState.clinic_name}</h1>
          <p>Treating Physician: {clinicState.doctor_name}</p>
        </div>

        {/* JOIN FORM */}
        {!currentToken ? (
          <div className="card join-container fade-in">
            <div>
              <h2 className="join-title">Check In</h2>
              <p className="join-subtitle">Join the digital queue in seconds</p>
            </div>
            
            {error && <div className="auth-error">{error}</div>}

            <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label htmlFor="name-input">Full Name</label>
                <input
                  id="name-input"
                  type="text"
                  placeholder="Enter your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={joining}
                />
              </div>

              <div className="form-group">
                <label htmlFor="phone-input">Mobile Phone (Optional)</label>
                <input
                  id="phone-input"
                  type="tel"
                  placeholder="e.g. 555-0199"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={joining}
                />
              </div>

              <button
                type="submit"
                className="btn-primary"
                style={{ width: '100%', padding: '14px', marginTop: '8px' }}
                disabled={joining || !name.trim()}
              >
                {joining ? 'Generating Token...' : 'Get My Token'}
              </button>
            </form>
          </div>
        ) : (
          /* ACTIVE TICKET SCREEN */
          <div className="card ticket-container fade-in">
            <div className="ticket-header">
              <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Welcome, <strong>{currentToken.name}</strong></span>
              
              <QueueIllustration 
                queue={clinicState.queue} 
                myTokenId={currentToken.id}
                doctorStatus={clinicState.doctor_status}
              />
              
              <div className="token-box">
                <span className="token-label">Your Token</span>
                <span className="token-number">{currentToken.token_number}</span>
              </div>
            </div>

            {currentToken.status === 'waiting' && (
              <>
                {peopleAhead === 0 ? (
                  <div className="status-banner status-up-next">
                    <span>✨ You are up next! Please stand by the door.</span>
                  </div>
                ) : (
                  <div className="status-banner status-waiting">
                    <span>👥 Waiting in line</span>
                  </div>
                )}

                <div className="ticket-stats">
                  <div className="stat-item">
                    <span className="stat-val">{peopleAhead}</span>
                    <span className="stat-lbl">people ahead</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-val">~{waitTime}m</span>
                    <span className="stat-lbl">est. wait time</span>
                  </div>
                </div>
                
                <button 
                  type="button" 
                  className="leave-link"
                  onClick={handleLeaveQueue}
                >
                  Leave queue
                </button>
              </>
            )}

            {currentToken.status === 'in_progress' && (
              <div className="status-banner status-called">
                <span>🚪 You're being called! Please enter the room.</span>
              </div>
            )}

            {currentToken.status === 'no_show' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
                <div className="status-banner status-no-show">
                  <span>⚠️ Marked as No-Show (Missed Call)</span>
                </div>
                <p style={{ fontSize: '14px' }}>
                  The clinic staff called you but you were not present. You have been removed from this turn.
                </p>
                <button 
                  type="button" 
                  className="btn-outline" 
                  onClick={handleRejoin}
                  style={{ alignSelf: 'center' }}
                >
                  Rejoin Queue
                </button>
              </div>
            )}

            {currentToken.status === 'completed' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
                <div className="status-banner status-completed">
                  <span>✅ Treatment Completed</span>
                </div>
                <p style={{ fontSize: '14px' }}>
                  Thank you! Your visit is completed. Have a wonderful day!
                </p>
                <button 
                  type="button" 
                  className="btn-primary" 
                  onClick={handleRejoin}
                  style={{ alignSelf: 'center' }}
                >
                  New Check-in
                </button>
              </div>
            )}

            {currentToken.status === 'cancelled' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
                <div className="status-banner status-waiting" style={{ color: 'var(--text-secondary)' }}>
                  <span>❌ Ticket Cancelled</span>
                </div>
                <p style={{ fontSize: '14px' }}>
                  This ticket has been cancelled by you or removed by the receptionist.
                </p>
                <button 
                  type="button" 
                  className="btn-primary" 
                  onClick={handleRejoin}
                  style={{ alignSelf: 'center' }}
                >
                  Join Again
                </button>
              </div>
            )}

            {!wsConnected && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                backgroundColor: 'rgba(217, 138, 108, 0.95)',
                color: 'white',
                padding: '6px',
                fontSize: '11px',
                fontWeight: '600',
                letterSpacing: '0.5px'
              }}>
                CONNECTION LOST. RECONNECTING...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
