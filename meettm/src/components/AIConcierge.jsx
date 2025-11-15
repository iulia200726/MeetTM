import React, { useState } from 'react';

function AIConcierge() {
  const [formData, setFormData] = useState({
    nrPersoane: '',
    buget: '',
    mood: '',
    zona: ''
  });
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setPlan(null);

    try {
      const response = await fetch('http://localhost:4124/api/plan-night', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        throw new Error('Failed to plan night');
      }

      const data = await response.json();
      setPlan(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = () => {
    if (!plan) return;

    const shareText = `Planul meu pentru seara:\n${plan.events.map(event => `${event.time}: ${event.title} (${event.location})`).join('\n')}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>AI Concierge - Plan my night</h1>

      <form onSubmit={handleSubmit} style={{ marginBottom: '30px' }}>
        <div style={{ marginBottom: '15px' }}>
          <label>Nr persoane:</label>
          <input
            type="number"
            name="nrPersoane"
            value={formData.nrPersoane}
            onChange={handleChange}
            required
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label>Buget:</label>
          <select
            name="buget"
            value={formData.buget}
            onChange={handleChange}
            required
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          >
            <option value="">Selectează buget</option>
            <option value="mic">Mic (sub 50 RON)</option>
            <option value="mediu">Mediu (50-150 RON)</option>
            <option value="mare">Mare (peste 150 RON)</option>
          </select>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label>Mood:</label>
          <select
            name="mood"
            value={formData.mood}
            onChange={handleChange}
            required
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          >
            <option value="">Selectează mood</option>
            <option value="chill">Chill</option>
            <option value="party">Party</option>
            <option value="cultural">Cultural</option>
            <option value="live-music">Muzică live</option>
          </select>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label>Zona:</label>
          <select
            name="zona"
            value={formData.zona}
            onChange={handleChange}
            required
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          >
            <option value="">Selectează zona</option>
            <option value="centru">Centru</option>
            <option value="old-town">Lipscani</option>
            <option value="bellu">Bellu</option>
            <option value="dorobanti">Dorobanți</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            background: '#1976d2',
            color: '#fff',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '16px'
          }}
        >
          {loading ? 'Planning...' : 'Plan my night'}
        </button>
      </form>

      {error && (
        <div style={{ color: 'red', marginBottom: '20px' }}>
          Error: {error}
        </div>
      )}

      {plan && (
        <div>
          <h2>Your Night Plan</h2>
          <div style={{ border: '1px solid #ccc', padding: '20px', borderRadius: '8px' }}>
            {plan.events.map((event, index) => (
              <div key={index} style={{ marginBottom: '15px', display: 'flex', alignItems: 'center' }}>
                <div style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: '#1976d2',
                  marginRight: '15px',
                  flexShrink: 0
                }}></div>
                <div>
                  <strong>{event.time}</strong> - {event.title}
                  <br />
                  <small>{event.location} - {event.reason}</small>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleShare}
            style={{
              background: '#25d366',
              color: '#fff',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '16px',
              marginTop: '20px'
            }}
          >
            Share with friends
          </button>
        </div>
      )}
    </div>
  );
}

export default AIConcierge;
