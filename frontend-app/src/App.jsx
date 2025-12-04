import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [request, setRequest] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentAnswer, setCurrentAnswer] = useState('');

  useEffect(() => {
    // Subscribe to event bus to receive agent questions
    const ws = new WebSocket('ws://api.localhost:8030');

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      // Listen for agent question events
      if (data.type === 'agent_question') {
        setQuestions(prev => [...prev, {
          agentId: data.agentId,
          agentName: data.agentName,
          question: data.question,
          context: data.context
        }]);
      }

      // Listen for orchestrator clarification requests
      if (data.type === 'orchestrator_needs_clarification') {
        setQuestions(prev => [...prev, {
          agentId: 'orchestrator',
          agentName: 'Orchestrator',
          question: data.clarifications.join('\n'),
          context: {}
        }]);
      }
    };

    ws.onopen = () => {
      console.log('[APP] Connected to event bus');
    };

    ws.onclose = () => {
      console.log('[APP] Disconnected from event bus');
    };

    return () => ws.close();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!request.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setQuestions([]);

    try {
      const response = await fetch('http://api.localhost:8030/api/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ request })
      });

      const data = await response.json();

      if (data.success) {
        setResult(data);
      } else {
        setError(data.error || 'An error occurred');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerQuestion = async (question) => {
    if (!currentAnswer.trim()) return;

    try {
      await fetch('http://api.localhost:8030/api/agent/answer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agentId: question.agentId,
          answer: currentAnswer
        })
      });

      setQuestions(prev => prev.filter(q => q !== question));
      setCurrentAnswer('');
    } catch (err) {
      console.error('Failed to answer question:', err);
    }
  };

  const exampleRequests = [
    'Create a simple todo list application with React',
    'Design a modern landing page for a SaaS product',
    'Research the best practices for building REST APIs',
    'Build a calculator component with basic operations',
    'Create a responsive navigation bar with dropdown menus'
  ];

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <h1 className="title">Agent-to-Agent System</h1>
          <p className="subtitle">
            Multi-agent orchestration with real-time event monitoring
          </p>
        </header>

        <form onSubmit={handleSubmit} className="form">
          <div className="input-group">
            <textarea
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="What would you like the agents to do? (e.g., Create a todo list app)"
              className="input"
              rows={4}
              disabled={loading}
            />
          </div>

          <button type="submit" disabled={loading || !request.trim()} className="submit-btn">
            {loading ? (
              <>
                <span className="spinner"></span>
                Processing...
              </>
            ) : (
              'Execute'
            )}
          </button>
        </form>

        <div className="examples">
          <p className="examples-title">Try these examples:</p>
          <div className="examples-grid">
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

        {questions.length > 0 && (
          <div className="questions">
            <h3>Agent Questions</h3>
            {questions.map((question, index) => (
              <div key={index} className="question-card">
                <div className="question-header">
                  <strong>{question.agentName}</strong> needs clarification:
                </div>
                <p className="question-text">{question.question}</p>
                <div className="question-actions">
                  <input
                    type="text"
                    value={currentAnswer}
                    onChange={(e) => setCurrentAnswer(e.target.value)}
                    placeholder="Your answer..."
                    className="question-input"
                  />
                  <button
                    onClick={() => handleAnswerQuestion(question)}
                    className="answer-btn"
                  >
                    Answer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="result error">
            <h3>Error</h3>
            <p>{error}</p>
          </div>
        )}

        {result && (
          <div className="result success">
            <h3>Result</h3>
            <div className="result-content">
              <p>{result.result}</p>

              {result.agentResults && result.agentResults.length > 0 && (
                <details className="agent-results">
                  <summary>Agent Contributions ({result.agentResults.length})</summary>
                  {result.agentResults.map((agentResult, index) => (
                    <div key={index} className="agent-result">
                      <strong>{agentResult.agentName}:</strong>
                      <pre>{agentResult.result}</pre>
                    </div>
                  ))}
                </details>
              )}
            </div>
          </div>
        )}

        <footer className="footer">
          <p>
            Monitor agent activity in real-time at{' '}
            <a href="http://monitor.localhost:8030" target="_blank" rel="noopener noreferrer">
              monitor.localhost:8030
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;
