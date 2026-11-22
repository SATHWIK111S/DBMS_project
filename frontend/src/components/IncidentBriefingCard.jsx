import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function IncidentBriefingCard({ incidentId = 1 }) {
  const { currentUser } = useAuth();
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviewStatus, setReviewStatus] = useState('DRAFT');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const fetchBriefing = async () => {
    setLoading(true);
    try {
      const res = await api.getAiBriefing(incidentId);
      setBriefing(res.briefing);
      setReviewStatus(res.briefing?.status || 'DRAFT');
    } catch (err) {
      console.error('Failed to load AI briefing:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBriefing();
  }, [incidentId]);

  const handleReview = async (newStatus) => {
    setIsSubmitting(true);
    try {
      await api.reviewAiBriefing({
        incident_id: incidentId,
        status: newStatus,
        summary: briefing.summary,
        shortages_summary: briefing.shortages_summary,
        recommendations: briefing.recommendations
      });
      setReviewStatus(newStatus);
      setMessage(`Briefing marked as ${newStatus} by Coordinator.`);
    } catch (err) {
      setMessage(`Review failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <p style={{ color: 'var(--text-muted)' }}>Generating AI Situational Briefing from aggregate incident metrics...</p>
      </div>
    );
  }

  if (!briefing) return null;

  return (
    <div className="card" style={{ borderLeft: '4px solid #0284c7' }}>
      <div className="card-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 className="card-title">🤖 AI Incident Briefing (Google Gemini)</h3>
            <span className="badge badge-medium">
              {reviewStatus === 'APPROVED' ? 'APPROVED BY COORDINATOR' : 'AI DRAFT - PENDING REVIEW'}
            </span>
          </div>
          <p className="card-subtitle">
            {briefing.disclaimer} • <span style={{ color: '#047857', fontWeight: 600 }}>Privacy Protected</span> (Household records withheld)
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchBriefing} title="Refresh AI assessment">
          Regenerate
        </button>
      </div>

      <div style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
        <h4 style={{ fontWeight: 600, color: '#1e293b', marginBottom: '0.25rem' }}>Executive Situation Summary</h4>
        <p style={{ color: '#334155', backgroundColor: '#f8fafc', padding: '0.75rem', borderRadius: '6px' }}>
          {briefing.summary}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <h4 style={{ fontWeight: 600, color: '#991b1b', marginBottom: '0.25rem', fontSize: '0.825rem' }}>
            ⚠️ Acute Shortage Alerts
          </h4>
          <pre style={{
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
            fontSize: '0.8rem',
            backgroundColor: '#fef2f2',
            padding: '0.6rem',
            borderRadius: '6px',
            color: '#7f1d1d'
          }}>
            {briefing.shortages_summary}
          </pre>
        </div>

        <div>
          <h4 style={{ fontWeight: 600, color: '#065f46', marginBottom: '0.25rem', fontSize: '0.825rem' }}>
            📋 Strategic Recommendations
          </h4>
          <pre style={{
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
            fontSize: '0.8rem',
            backgroundColor: '#ecfdf5',
            padding: '0.6rem',
            borderRadius: '6px',
            color: '#064e3b'
          }}>
            {briefing.recommendations}
          </pre>
        </div>
      </div>

      {message && <div className="alert alert-info">{message}</div>}

      {currentUser.role === 'coordinator' && reviewStatus !== 'APPROVED' && (
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
          <button
            className="btn btn-success btn-sm"
            disabled={isSubmitting}
            onClick={() => handleReview('APPROVED')}
          >
            ✓ Approve Official Briefing
          </button>
          <button
            className="btn btn-secondary btn-sm"
            disabled={isSubmitting}
            onClick={() => handleReview('REJECTED')}
          >
            Reject / Request Revision
          </button>
        </div>
      )}
    </div>
  );
}
