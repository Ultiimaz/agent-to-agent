import { useEffect, useRef, useState } from 'react';
import './App.css';

const EVENT_COLORS = {
  orchestrator_started: '#3b82f6',
  orchestrator_plan_created: '#8b5cf6',
  orchestrator_delegating: '#ec4899',
  orchestrator_completed: '#10b981',
  orchestrator_error: '#ef4444',
  orchestrator_agent_registered: '#22c55e',
  agent_started: '#06b6d4',
  agent_thinking: '#6366f1',
  agent_tool_calls: '#f59e0b',
  agent_completed: '#10b981',
  agent_error: '#ef4444',
  agent_question: '#eab308',
  agent_mcp_connected: '#22c55e',
  connection: '#64748b'
};

function App() {
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [filter, setFilter] = useState('all');
  const eventsEndRef = useRef(null);
  const wsRef = useRef(null);

  const scrollToBottom = () => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [events]);

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const connectWebSocket = () => {
    const ws = new WebSocket('ws://api.localhost:8030');

    ws.onopen = () => {
      console.log('[MONITOR] Subscribed to event bus');
      setConnected(true);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'connection') {
        console.log('[MONITOR] Received event history:', data.events?.length || 0, 'events');
        setEvents(data.events || []);
      } else {
        console.log('[MONITOR] Received event:', data.type);
        setEvents(prev => [...prev, data]);
      }
    };

    ws.onerror = (error) => {
      console.error('[MONITOR] WebSocket error:', error);
      setConnected(false);
    };

    ws.onclose = () => {
      console.log('[MONITOR] Unsubscribed from event bus - reconnecting...');
      setConnected(false);
      setTimeout(connectWebSocket, 3000);
    };

    wsRef.current = ws;
  };

  const clearEvents = async () => {
    try {
      await fetch('http://api.localhost:8030/api/events', {
        method: 'DELETE'
      });
      setEvents([]);
    } catch (error) {
      console.error('Failed to clear events:', error);
    }
  };

  const fetchEventBusStats = async () => {
    try {
      const response = await fetch('http://api.localhost:8030/api/events');
      const data = await response.json();
      setSubscriberCount(data.subscriberCount);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  useEffect(() => {
    const interval = setInterval(fetchEventBusStats, 2000);
    return () => clearInterval(interval);
  }, []);

  const filteredEvents = filter === 'all'
    ? events
    : events.filter(evt => {
        if (filter === 'orchestrator') return evt.type.startsWith('orchestrator');
        if (filter === 'agents') return evt.type.startsWith('agent');
        if (filter === 'errors') return evt.type.includes('error');
        return true;
      });

  const getEventIcon = (type) => {
    if (type.includes('error')) return '⚠️';
    if (type.includes('completed')) return '✓';
    if (type.includes('started')) return '▶';
    if (type.includes('question')) return '?';
    if (type.includes('thinking')) return '...';
    return '•';
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>Event Bus Monitor</h1>
          <span className={`status ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? '● Subscribed' : '○ Disconnected'}
          </span>
          <span className="subscriber-count">
            {subscriberCount} subscriber{subscriberCount !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="header-right">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="filter">
            <option value="all">All Events</option>
            <option value="orchestrator">Orchestrator</option>
            <option value="agents">Agents</option>
            <option value="errors">Errors</option>
          </select>
          <button onClick={clearEvents} className="clear-btn">Clear Queue</button>
        </div>
      </header>

      <div className="events">
        {filteredEvents.length === 0 ? (
          <div className="empty-state">
            <p>Event queue is empty. Waiting for agents to publish events...</p>
          </div>
        ) : (
          filteredEvents.map((evt) => (
            <div
              key={evt.id}
              className="event"
              style={{ borderLeftColor: EVENT_COLORS[evt.type] || '#64748b' }}
            >
              <div className="event-header">
                <span className="event-icon">{getEventIcon(evt.type)}</span>
                <span className="event-type">{evt.type}</span>
                <span className="event-time">
                  {new Date(evt.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="event-content">
                {evt.agentName && (
                  <div className="event-agent">Agent: {evt.agentName}</div>
                )}
                {evt.task && (
                  <div className="event-task">Task: {evt.task}</div>
                )}
                {evt.result && (
                  <div className="event-result">
                    <strong>Result:</strong>
                    <pre>{typeof evt.result === 'string' ? evt.result : JSON.stringify(evt.result, null, 2)}</pre>
                  </div>
                )}
                {evt.error && (
                  <div className="event-error">Error: {evt.error}</div>
                )}
                {evt.question && (
                  <div className="event-question">Question: {evt.question}</div>
                )}
                {evt.plan && (
                  <div className="event-plan">
                    <strong>Plan:</strong>
                    <pre>{JSON.stringify(evt.plan, null, 2)}</pre>
                  </div>
                )}
                {evt.analysis && (
                  <div className="event-analysis">Analysis: {evt.analysis}</div>
                )}
                {evt.request && (
                  <div className="event-request">Request: {evt.request}</div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={eventsEndRef} />
      </div>
    </div>
  );
}

export default App;
