import React, { useState } from 'react';
import '../styles/billing.css';

export default function SubscriptionLockout({ clinicName }) {
  const [licenseKey, setLicenseKey] = useState('');
  const [error, setError] = useState('');
  const [activating, setActivating] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!licenseKey.trim()) return;

    setActivating(true);
    setError('');

    try {
      const response = await fetch('/api/billing/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: licenseKey.trim() })
      });
      const data = await response.json();

      if (data.success) {
        // App will unlock automatically due to WebSocket state update, 
        // but we clear input just in case
        setLicenseKey('');
      } else {
        setError(data.error || 'Invalid license key. Check spelling and try again.');
      }
    } catch (err) {
      setError('Connection failed. Please check internet and try again.');
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="lockout-overlay">
      <div className="card lockout-card">
        <div className="lockout-icon-box">
          🔒
        </div>
        
        <div>
          <h2 className="lockout-title">Subscription Required</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '4px' }}>{clinicName}</p>
        </div>

        <p className="lockout-desc">
          Your 30-day free trial of **QueueLess** has expired. Please enter a valid subscription license key to unlock your queue dashboard and patient check-in portals.
        </p>

        {error && <div className="auth-error" style={{ width: '100%' }}>{error}</div>}

        <form onSubmit={handleSubmit} className="activation-form">
          <div className="form-group" style={{ textAlign: 'left' }}>
            <label htmlFor="license-input">License Key</label>
            <input
              id="license-input"
              type="text"
              placeholder="e.g. QL-XXXX-XXXX-XXXX"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              required
              disabled={activating}
            />
          </div>

          <button 
            type="submit" 
            className="btn-primary" 
            style={{ width: '100%', padding: '14px' }}
            disabled={activating || !licenseKey.trim()}
          >
            {activating ? 'Verifying Activation Key...' : 'Activate Subscription'}
          </button>
        </form>

        <div style={{ marginTop: '8px', fontSize: '12px' }}>
          <p>
            Need a license key? Contact support at <a href="mailto:billing@queueless.clinic" style={{ color: 'var(--primary-color)', fontWeight: '600' }}>billing@queueless.clinic</a>
          </p>
          <p style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-light)' }}>
            Demo Passcode: <code>QL-ACTIVE-8899-CLINIC</code>
          </p>
        </div>
      </div>
    </div>
  );
}
