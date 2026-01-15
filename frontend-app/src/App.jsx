import { useState, useEffect, useRef } from 'react';
import WebContainerPreview from './components/WebContainerPreview';
import './App.css';

const API_BASE = 'http://api.localhost:8030';
const POLL_INTERVAL = 1000;

function App() {
  const [request, setRequest] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [taskId, setTaskId] = useState(null);
  const [taskStatus, setTaskStatus] = useState(null);
  const [clarification, setClarification] = useState(null);
  const [clarificationAnswer, setClarificationAnswer] = useState('');
  const [previewCode, setPreviewCode] = useState(null);
  const [activeTab, setActiveTab] = useState('preview');
  const pollIntervalRef = useRef(null);

  // Poll for task status
  useEffect(() => {
    if (!taskId || !loading) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    const pollTask = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/tasks/${taskId}`);
        const task = await response.json();

        setTaskStatus(task.status);

        if (task.status === 'completed') {
          setResult(task.result);
          setLoading(false);
          setClarification(null);
          // Extract code for preview
          if (task.result?.result) {
            setPreviewCode(task.result.result);
          }
          if (task.result?.agentResults) {
            // Look for code in agent results
            for (const agentResult of task.result.agentResults) {
              if (agentResult.result && hasCode(agentResult.result)) {
                setPreviewCode(agentResult.result);
                break;
              }
            }
          }
        } else if (task.status === 'error') {
          setError(task.error);
          setLoading(false);
          setClarification(null);
        } else if (task.status === 'waiting_for_clarification') {
          setClarification(task.clarification);
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    };

    pollTask();
    pollIntervalRef.current = setInterval(pollTask, POLL_INTERVAL);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [taskId, loading]);

  // Check if text contains code
  function hasCode(text) {
    return text && (
      text.includes('```') ||
      text.includes('export default') ||
      text.includes('function') && text.includes('return')
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!request.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setTaskId(null);
    setTaskStatus(null);
    setClarification(null);

    try {
      const response = await fetch(`${API_BASE}/api/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ request })
      });

      const data = await response.json();

      if (data.taskId) {
        setTaskId(data.taskId);
        setTaskStatus(data.status);
      } else {
        setError(data.error || 'Failed to start task');
        setLoading(false);
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleSubmitClarification = async () => {
    if (!clarificationAnswer.trim() || !taskId) return;

    try {
      await fetch(`${API_BASE}/api/tasks/${taskId}/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ answer: clarificationAnswer })
      });

      setClarificationAnswer('');
      setClarification(null);
      setTaskStatus('running');
    } catch (err) {
      console.error('Failed to submit clarification:', err);
    }
  };

  const exampleRequests = [
    'Create a todo list component with add and delete functionality',
    'Build a calculator component with basic operations',
    'Create a responsive navigation bar with dropdown menus',
    'Design a pricing card component with three tiers',
    'Build a countdown timer component'
  ];

  return (
    <div className="app-layout">
      {/* Left Panel - Input */}
      <div className="left-panel">
        <header className="header">
          <h1 className="title">Agent-to-Agent</h1>
          <p className="subtitle">AI-powered component generation with live preview</p>
        </header>

        <form onSubmit={handleSubmit} className="form">
          <div className="input-group">
            <textarea
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="Describe the React component you want to create..."
              className="input"
              rows={4}
              disabled={loading}
            />
          </div>

          <button type="submit" disabled={loading || !request.trim()} className="submit-btn">
            {loading ? (
              <>
                <span className="spinner"></span>
                {taskStatus === 'waiting_for_clarification' ? 'Waiting...' : 'Generating...'}
              </>
            ) : (
              'Generate'
            )}
          </button>

          {taskStatus && (
            <div className="task-status">
              <span className={`status-dot status-${taskStatus}`}></span>
              <span>{taskStatus.replace(/_/g, ' ')}</span>
            </div>
          )}
        </form>

        <div className="examples">
          <p className="examples-title">Examples:</p>
          <div className="examples-list">
            {exampleRequests.map((example, index) => (
              <button
                key={index}
                onClick={() => setRequest(example)}
                className="example-btn"
                disabled={loading}
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        {clarification && (
          <div className="clarification">
            <h3>Clarification Needed</h3>
            <div className="clarification-card">
              {clarification.questions.map((q, index) => (
                <p key={index} className="clarification-question">{q}</p>
              ))}
              <textarea
                value={clarificationAnswer}
                onChange={(e) => setClarificationAnswer(e.target.value)}
                placeholder="Your answer..."
                className="clarification-input"
                rows={2}
              />
              <button
                onClick={handleSubmitClarification}
                className="answer-btn"
                disabled={!clarificationAnswer.trim()}
              >
                Submit
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="error-box">
            <strong>Error:</strong> {error}
          </div>
        )}

        <footer className="footer">
          <a href="http://monitor.localhost:8030" target="_blank" rel="noopener noreferrer">
            Open Monitor
          </a>
        </footer>
      </div>

      {/* Right Panel - Preview */}
      <div className="right-panel">
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'preview' ? 'active' : ''}`}
            onClick={() => setActiveTab('preview')}
          >
            Preview
          </button>
          <button
            className={`tab ${activeTab === 'code' ? 'active' : ''}`}
            onClick={() => setActiveTab('code')}
          >
            Code
          </button>
        </div>

        <div className="tab-content">
          {activeTab === 'preview' ? (
            <WebContainerPreview generatedCode={previewCode} />
          ) : (
            <div className="code-view">
              {result ? (
                <div className="code-content">
                  <div className="code-section">
                    <h4>Result</h4>
                    <pre>{result.result}</pre>
                  </div>
                  {result.agentResults?.map((agentResult, index) => (
                    <div key={index} className="code-section">
                      <h4>{agentResult.agentName}</h4>
                      <pre>{agentResult.result}</pre>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="code-placeholder">
                  <p>Generated code will appear here</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
