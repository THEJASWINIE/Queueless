import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import '../styles/dashboard.css';

export default function ReceptionistView({ token, onLogout, clinicState, wsConnected }) {
  const [showWalkinModal, setShowWalkinModal] = useState(false);
  const [walkinName, setWalkinName] = useState('');
  const [walkinPhone, setWalkinPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const qrCanvasRef = useRef(null);

  // Live update elapsed wait timers every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Render QR code
  useEffect(() => {
    if (qrCanvasRef.current) {
      const patientUrl = `${window.location.origin}/`;
      QRCode.toCanvas(
        qrCanvasRef.current,
        patientUrl,
        {
          width: 140,
          margin: 1,
          color: {
            dark: '#4A6B53',
            light: '#FAF7F2'
          }
        },
        (err) => {
          if (err) console.error('QR code generation failed:', err);
        }
      );
    }
  }, [clinicState]);

  const handleAddWalkin = async (e) => {
    e.preventDefault();
    if (!walkinName.trim()) return;

    setSubmitting(true);
    try {
      const response = await fetch('/api/queue/walk-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: walkinName, phone: walkinPhone })
      });
      const data = await response.json();
      if (data.success) {
        setShowWalkinModal(false);
        setWalkinName('');
        setWalkinPhone('');
      } else {
        alert(data.error || 'Failed to add walk-in');
      }
    } catch (err) {
      alert('Network error adding walk-in.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNoShow = async (id) => {
    const confirmAction = window.confirm('Mark this patient as a No-Show?');
    if (!confirmAction) return;

    try {
      const response = await fetch('/api/queue/no-show', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ id })
      });
      if (!response.ok) {
        const data = await response.json();
        alert(data.error || 'Failed to flag no-show');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemove = async (id) => {
    const confirmAction = window.confirm('Remove this patient from the queue?');
    if (!confirmAction) return;

    try {
      const response = await fetch('/api/queue/remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ id })
      });
      if (!response.ok) {
        const data = await response.json();
        alert(data.error || 'Failed to remove patient');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getElapsedMinutes = (joinedAtStr) => {
    const joined = new Date(joinedAtStr);
    const diffMs = currentTime - joined;
    return Math.max(0, Math.floor(diffMs / 60000));
  };

  const getActiveDuration = (calledAtStr, completedAtStr) => {
    const called = new Date(calledAtStr);
    const end = completedAtStr ? new Date(completedAtStr) : currentTime;
    const diffMs = end - called;
    return Math.max(0, Math.floor(diffMs / 60000));
  };

  if (!clinicState) {
    return (
      <div className="main-content">
        <div className="spinner" style={{ marginTop: '80px' }} />
        <p style={{ marginTop: '16px' }}>Loading Dashboard...</p>
      </div>
    );
  }

  const avgWaitMins = Math.round(clinicState.stats.avg_service_time_seconds / 60) || 5;
  const longWaitThreshold = Math.max(15, avgWaitMins * 2);

  const activeQueue = clinicState.queue.filter(t => t.status === 'waiting' || t.status === 'in_progress');
  const pastQueue = clinicState.queue.filter(t => t.status === 'completed' || t.status === 'no_show' || t.status === 'cancelled');

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });

  return (
    <div className="main-content">
      <div className="dashboard-layout fade-in">
        
        {/* Top Header bar */}
        <div className="dashboard-header">
          <div className="dashboard-header-title">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <h1>{clinicState.clinic_name} Dashboard</h1>
              {clinicState.subscription_status === 'active' ? (
                <span className="trial-indicator-badge" style={{ borderColor: '#2F855A', color: '#2F855A', backgroundColor: '#F0FFF4' }}>
                  ✨ Active Subscription
                </span>
              ) : (
                <span className="trial-indicator-badge">
                  ⏳ 30-Day Free Trial ({clinicState.days_remaining} days left)
                </span>
              )}
            </div>
            <p>Reception Portal — Real-time updates active</p>
          </div>
          <div className="dashboard-header-actions">
            <span className="date-display">{todayStr}</span>
            <button className="btn-outline" onClick={onLogout} style={{ padding: '8px 16px', fontSize: '14px' }}>
              Logout
            </button>
          </div>
        </div>

        {/* Basic Stats row */}
        <div className="stats-grid">
          <div className="card stat-card">
            <div className="stat-header">
              <span>Waiting Now</span>
              <span style={{ fontSize: '20px' }}>👥</span>
            </div>
            <span className="stat-number">{clinicState.stats.waiting_now}</span>
          </div>

          <div className="card stat-card">
            <div className="stat-header">
              <span>Doctor Status</span>
              <span style={{ fontSize: '20px' }}>⚕️</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
              <span style={{ fontWeight: '600' }}>{clinicState.doctor_name}</span>
              <span className={`doctor-badge ${clinicState.doctor_status === 'Free' ? 'doctor-free' : 'doctor-busy'}`}>
                {clinicState.doctor_status === 'Free' ? 'Free' : 'Busy'}
              </span>
            </div>
          </div>

          <div className="card stat-card">
            <div className="stat-header">
              <span>Completed Today</span>
              <span style={{ fontSize: '20px' }}>✅</span>
            </div>
            <span className="stat-number">{clinicState.stats.completed_today}</span>
          </div>

          <div className="card stat-card">
            <div className="stat-header">
              <span>Total Checked In</span>
              <span style={{ fontSize: '20px' }}>📈</span>
            </div>
            <span className="stat-number">{clinicState.stats.total_joined}</span>
          </div>
        </div>

        {/* Dashboard Actions and Table */}
        <div className="dashboard-grid">
          <div className="card">
            <div className="table-header-row">
              <h2>Active Patients ({activeQueue.length})</h2>
              <button className="btn-primary" onClick={() => setShowWalkinModal(true)} style={{ padding: '8px 16px', fontSize: '14px' }}>
                + Add Walk-In
              </button>
            </div>

            <div className="table-wrapper">
              {activeQueue.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-state-icon">📋</span>
                  <h3>No patients waiting</h3>
                  <p>The queue is currently empty. Patients can join by scanning the QR code below.</p>
                </div>
              ) : (
                <table className="queue-table">
                  <thead>
                    <tr>
                      <th className="col-token">Token</th>
                      <th className="col-name">Patient Name</th>
                      <th className="col-phone">Phone</th>
                      <th>Wait Time</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeQueue.map((patient) => {
                      const elapsed = getElapsedMinutes(patient.joined_at);
                      const isUnusuallyLong = patient.status === 'waiting' && elapsed >= longWaitThreshold;

                      return (
                        <tr key={patient.id} className={isUnusuallyLong ? 'row-warning' : ''}>
                          <td className="col-token">#{patient.token_number}</td>
                          <td className="col-name">
                            {patient.name}
                            {patient.source === 'walk-in' && (
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '6px', fontWeight: 'normal', backgroundColor: '#EDF2F7', padding: '2px 6px', borderRadius: '4px' }}>
                                Walk-in
                              </span>
                            )}
                          </td>
                          <td className="col-phone">{patient.phone || '—'}</td>
                          <td>
                            {patient.status === 'waiting' ? (
                              <span className="live-wait">
                                ⏳ {elapsed} mins
                                {isUnusuallyLong && (
                                  <span className="warning-indicator" title={`Waiting longer than 2x average (${longWaitThreshold} mins)`}>
                                    ⚠️ Delayed
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="live-wait" style={{ color: 'var(--primary-color)', fontWeight: '600' }}>
                                🩺 Called {getActiveDuration(patient.called_at)}m ago
                              </span>
                            )}
                          </td>
                          <td>
                            <span className={`badge badge-${patient.status}`}>
                              {patient.status === 'in_progress' ? 'With Doctor' : patient.status}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                              <button
                                className="btn-outline btn-danger-outline"
                                onClick={() => handleNoShow(patient.id)}
                                style={{ padding: '6px 12px', fontSize: '13px' }}
                              >
                                No Show
                              </button>
                              <button
                                className="btn-outline"
                                onClick={() => handleRemove(patient.id)}
                                style={{ padding: '6px 12px', fontSize: '13px' }}
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            
            {/* Display QR code at bottom of dashboard */}
            <div className="qr-container">
              <div>
                <h3 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '4px' }}>Patient Check-In QR Code</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto' }}>
                  Print this page or show this QR code at reception for patients to scan and join from their mobile devices.
                </p>
              </div>
              <div className="qr-canvas-box">
                <canvas ref={qrCanvasRef}></canvas>
              </div>
              <a href={`${window.location.origin}/`} target="_blank" rel="noreferrer" className="qr-link">
                {window.location.origin}/
              </a>
            </div>
          </div>
        </div>

        {/* Log History */}
        {pastQueue.length > 0 && (
          <div className="card" style={{ opacity: 0.85 }}>
            <div className="table-header-row" style={{ backgroundColor: '#F7F6F0' }}>
              <h2 style={{ color: 'var(--text-secondary)' }}>Log History Today ({pastQueue.length})</h2>
            </div>
            <div className="table-wrapper">
              <table className="queue-table">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Service Duration</th>
                    <th>Arrived</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {pastQueue.map((patient) => {
                    const svcDuration = patient.called_at && patient.completed_at
                      ? getActiveDuration(patient.called_at, patient.completed_at)
                      : null;
                      
                    return (
                      <tr key={patient.id}>
                        <td className="col-token">#{patient.token_number}</td>
                        <td className="col-name">{patient.name}</td>
                        <td>
                          <span className={`badge badge-${patient.status}`}>{patient.status}</span>
                        </td>
                        <td>{svcDuration !== null ? `${svcDuration} mins` : '—'}</td>
                        <td>{new Date(patient.joined_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                        <td>{patient.completed_at ? new Date(patient.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* WALK-IN MODAL */}
        {showWalkinModal && (
          <div className="modal-overlay" onClick={() => setShowWalkinModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Add Walk-In Patient</h3>
                <button className="close-btn" onClick={() => setShowWalkinModal(false)}>
                  ×
                </button>
              </div>
              <form onSubmit={handleAddWalkin}>
                <div className="modal-body">
                  <div className="form-group">
                    <label htmlFor="modal-name">Patient Name</label>
                    <input
                      id="modal-name"
                      type="text"
                      placeholder="Enter patient full name"
                      value={walkinName}
                      onChange={(e) => setWalkinName(e.target.value)}
                      required
                      autoFocus
                      disabled={submitting}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="modal-phone">Phone Number (Optional)</label>
                    <input
                      id="modal-phone"
                      type="tel"
                      placeholder="e.g. 555-0100"
                      value={walkinPhone}
                      onChange={(e) => setWalkinPhone(e.target.value)}
                      disabled={submitting}
                    />
                  </div>
                </div>
                <div className="modal-actions" style={{ padding: '0 20px 20px 20px' }}>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setShowWalkinModal(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={submitting || !walkinName.trim()}
                  >
                    {submitting ? 'Adding...' : 'Add to Queue'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {!wsConnected && (
          <div style={{
            position: 'fixed',
            bottom: '16px',
            right: '16px',
            backgroundColor: '#C53030',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '4px',
            fontSize: '13px',
            fontWeight: '600',
            boxShadow: 'var(--shadow-md)',
            zIndex: 99
          }}>
            Offline. Reconnecting...
          </div>
        )}
      </div>
    </div>
  );
}
