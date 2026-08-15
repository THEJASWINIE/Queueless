import React, { useState } from 'react';
import '../styles/doctor.css';

export default function DoctorView({ token, onLogout, clinicState, wsConnected }) {
  const [actionLoading, setActionLoading] = useState(false);

  const handleCallNext = async () => {
    if (actionLoading) return;
    setActionLoading(true);

    try {
      const response = await fetch('/api/queue/call-next', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        const data = await response.json();
        alert(data.error || 'Failed to call next patient');
      }
    } catch (err) {
      alert('Network error calling next patient.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteCurrent = async () => {
    const currentId = clinicState?.current_doctor_token_id;
    if (!currentId || actionLoading) return;
    
    setActionLoading(true);
    try {
      const response = await fetch('/api/queue/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ id: currentId })
      });
      if (!response.ok) {
        const data = await response.json();
        alert(data.error || 'Failed to complete patient');
      }
    } catch (err) {
      alert('Network error completing patient.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleNoShowCurrent = async () => {
    const currentId = clinicState?.current_doctor_token_id;
    if (!currentId || actionLoading) return;

    const confirmAction = window.confirm('Mark the current patient as a No-Show?');
    if (!confirmAction) return;

    setActionLoading(true);
    try {
      const response = await fetch('/api/queue/no-show', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ id: currentId })
      });
      if (!response.ok) {
        const data = await response.json();
        alert(data.error || 'Failed to flag no-show');
      }
    } catch (err) {
      alert('Network error marking no-show.');
    } finally {
      setActionLoading(false);
    }
  };

  if (!clinicState) {
    return (
      <div className="main-content">
        <div className="spinner" style={{ marginTop: '80px' }} />
        <p style={{ marginTop: '16px' }}>Loading Doctor Dashboard...</p>
      </div>
    );
  }

  const isBusy = clinicState.doctor_status === 'With patient';
  const waitingList = clinicState.queue.filter(t => t.status === 'waiting');
  const waitingCount = waitingList.length;

  const currentPatient = isBusy 
    ? clinicState.queue.find(t => t.id === clinicState.current_doctor_token_id)
    : null;

  return (
    <div className="main-content">
      <div className="doctor-layout fade-in">
        
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <div className="doctor-header">
            <h1 className="doctor-title">{clinicState.doctor_name}</h1>
            <p className="doctor-subtitle">Consultation Console</p>
          </div>
          <button className="btn-outline" onClick={onLogout} style={{ padding: '8px 16px', fontSize: '14px' }}>
            Logout
          </button>
        </div>

        <div className="card doctor-card">
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
            <span className="current-patient-label">
              {isBusy ? 'Current Patient' : 'Room Status'}
            </span>
            
            {isBusy && currentPatient ? (
              <div>
                <h2 className="current-patient-name">{currentPatient.name}</h2>
                <span className="badge badge-waiting" style={{ marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
                  Token #{currentPatient.token_number}
                </span>
              </div>
            ) : (
              <div className="no-patient-state">
                <span>Room is Empty — Ready for Patient</span>
              </div>
            )}
          </div>

          {!isBusy ? (
            <button
              type="button"
              className="btn-doctor-giant btn-doctor-call"
              onClick={handleCallNext}
              disabled={waitingCount === 0 || actionLoading}
            >
              {waitingCount > 0 ? (
                <>
                  <span>Call Next Patient</span>
                  <span style={{ fontSize: '24px', marginLeft: '6px' }}>🔊</span>
                </>
              ) : (
                'No one waiting'
              )}
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', width: '100%' }}>
              <button
                type="button"
                className="btn-doctor-giant btn-doctor-done"
                onClick={handleCompleteCurrent}
                disabled={actionLoading}
              >
                <span>Mark Treatment Done</span>
                <span style={{ fontSize: '24px', marginLeft: '6px' }}>✅</span>
              </button>
              
              <button
                type="button"
                className="btn-danger-outline btn-outline"
                onClick={handleNoShowCurrent}
                style={{ padding: '8px 24px', fontSize: '15px', fontWeight: '600' }}
                disabled={actionLoading}
              >
                ⚠️ Patient is No-Show (Skip)
              </button>
            </div>
          )}

          <div className="queue-summary">
            {waitingCount > 0 && <div className="queue-dot" />}
            <span>
              {waitingCount === 0 
                ? 'Queue is empty' 
                : `${waitingCount} patient${waitingCount === 1 ? '' : 's'} waiting in line`
              }
            </span>
          </div>

        </div>

        {!wsConnected && (
          <div style={{
            backgroundColor: '#C53030',
            color: 'white',
            padding: '8px 24px',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: '600',
            boxShadow: 'var(--shadow-md)'
          }}>
            Offline. Reconnecting...
          </div>
        )}
      </div>
    </div>
  );
}
