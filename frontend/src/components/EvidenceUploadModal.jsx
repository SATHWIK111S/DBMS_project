import React, { useState } from 'react';
import api from '../api/client';

export default function EvidenceUploadModal({ dispatch, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [processedResult, setProcessedResult] = useState(null);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select an image file to upload.');
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('photo', file);
    formData.append('dispatch_id', dispatch?.dispatch_id || '');
    formData.append('description', description || `Evidence photo for Dispatch #${dispatch?.dispatch_id}`);

    try {
      const res = await api.uploadEvidence(formData);
      setProcessedResult(res);
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.message || 'Evidence upload and OpenCV processing failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Upload Field Verification Evidence (OpenCV)</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert alert-danger">{error}</div>}

            {dispatch && (
              <div style={{ backgroundColor: '#f1f5f9', padding: '0.6rem 0.75rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.8rem' }}>
                <div><strong>Dispatch ID:</strong> #{dispatch.dispatch_id}</div>
                <div><strong>Destination Zone:</strong> {dispatch.zone_name}</div>
                <div><strong>Item:</strong> {dispatch.dispatch_qty} {dispatch.unit} {dispatch.item_name}</div>
              </div>
            )}

            <div className="form-group">
              <label>Select Photo (JPEG, PNG, WebP)</label>
              <input type="file" accept="image/*" onChange={handleFileChange} required />
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Validated and auto-rotated via FastAPI + OpenCV microservice.
              </span>
            </div>

            <div className="form-group">
              <label>Description / Verification Notes</label>
              <textarea
                rows="2"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="e.g. Verified by Field Officer Carlos. Handed over at Community Center."
              />
            </div>

            {processedResult && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#ecfdf5', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                <div style={{ fontWeight: 600, color: '#047857', fontSize: '0.85rem' }}>✓ Image Verified by OpenCV</div>
                <div style={{ fontSize: '0.75rem', color: '#065f46', marginTop: '2px' }}>
                  Dimensions: {processedResult.width} x {processedResult.height}px • Format: {processedResult.file_type}
                </div>
                {processedResult.thumbnail_path && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <img
                      src={processedResult.thumbnail_path}
                      alt="Thumbnail preview"
                      style={{ maxHeight: '120px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {processedResult ? 'Close' : 'Cancel'}
            </button>
            {!processedResult && (
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Processing with OpenCV...' : 'Upload & Verify Photo'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
