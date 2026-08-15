import React, { useState } from 'react';
import '../styles/auth.css';

export default function AuthView({ role, onLoginSuccess }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const displayRoleName = role === 'doctor' ? 'Doctor' : 'Receptionist';
  const maxDigits = 4;

  const handleNumberTap = (num) => {
    if (pin.length < maxDigits) {
      setError('');
      const newPin = pin + num;
      setPin(newPin);
      
      // Auto-submit when maximum digits reached
      if (newPin.length === maxDigits) {
        submitPin(newPin);
      }
    }
  };

  const handleBackspace = () => {
    if (pin.length > 0) {
      setPin(pin.slice(0, -1));
      setError('');
    }
  };

  const handleClear = () => {
    setPin('');
    setError('');
  };

  const submitPin = async (enteredPin) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, pin: enteredPin }),
      });
      const data = await response.json();
      
      if (data.success && data.token) {
        // Save to local storage
        localStorage.setItem(`queueless_${role}_token`, data.token);
        onLoginSuccess(data.token);
      } else {
        setError(data.error || 'Invalid PIN. Please try again.');
        setPin(''); // Reset on error
      }
    } catch (err) {
      setError('Connection error. Please try again.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-layout fade-in">
      <div className="card auth-card">
        <div className="auth-header">
          <h2>{displayRoleName} Access</h2>
          <p>Please enter your 4-digit PIN</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <div className="pin-dots">
          {[...Array(maxDigits)].map((_, i) => (
            <div 
              key={i} 
              className={`pin-dot ${i < pin.length ? 'active' : ''}`}
            />
          ))}
        </div>

        <div className="keypad-grid">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              type="button"
              className="keypad-btn"
              onClick={() => handleNumberTap(num.toString())}
              disabled={loading}
            >
              {num}
            </button>
          ))}
          
          <button
            type="button"
            className="keypad-btn keypad-btn-action"
            onClick={handleClear}
            disabled={loading || pin.length === 0}
          >
            Clear
          </button>
          
          <button
            type="button"
            className="keypad-btn"
            onClick={() => handleNumberTap('0')}
            disabled={loading}
          >
            0
          </button>
          
          <button
            type="button"
            className="keypad-btn keypad-btn-action"
            onClick={handleBackspace}
            disabled={loading || pin.length === 0}
          >
            ⌫
          </button>
        </div>
      </div>
    </div>
  );
}
