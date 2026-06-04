'use client';

import { useEffect, useRef, useState } from 'react';
import {
  assertiveColor, BLOCK_META, displayHeadline, displayIssueSummary,
  resolveInsights, STYLE_METERS, STYLES_INTRO,
} from './insightsView.js';
import { StylePieChart } from './StylePieChart.jsx';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const j = (r) => r.json();
const api = {
  getPeople: () => fetch(`${API}/api/people`).then(j),
  addPerson: (name, relationship) =>
    fetch(`${API}/api/people`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, relationship }) }).then(j),
  startConversation: (person_id, title, situation) =>
    fetch(`${API}/api/conversations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ person_id, title, situation }) }).then(j),
  sendTurn: (id, content) =>
    fetch(`${API}/api/conversations/${id}/turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content }) }).then(j),
  finish: (id, duration) =>
    fetch(`${API}/api/conversations/${id}/finish`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ duration }) }).then(j),
  history: (personId) => fetch(`${API}/api/conversations${personId ? `?person_id=${personId}` : ''}`).then(j),
  getConversation: (id) => fetch(`${API}/api/conversations/${id}`).then(j),
};

const AVATAR_COLORS = ['#c4a96e', '#b8a0d4', '#9b8cf0', '#e8a23d', '#3ec46a'];
const colorFor = (i) => AVATAR_COLORS[i % AVATAR_COLORS.length];

export default function App() {
  const [screen, setScreen] = useState('choose');
  const [people, setPeople] = useState([]);
  const [person, setPerson] = useState(null);
  const [situation, setSituation] = useState('');
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [history, setHistory] = useState([]);

  useEffect(() => { api.getPeople().then(setPeople); }, []);

  const pickPerson = (p) => { setPerson(p); setScreen('describe'); };

  const addPerson = async () => {
    const name = prompt('Name?');
    if (!name) return;
    const rel = prompt('Relationship? (e.g. flatmate)') || '';
    const p = await api.addPerson(name, rel);
    setPeople([p, ...people]);
  };

  const startCall = async () => {
    const title = situation.split(' ').slice(0, 3).join(' ') || 'Untitled';
    const conv = await api.startConversation(person.id, title, situation);
    setConversation(conv);
    setMessages([]);
    setScreen('call');
  };

  const endCall = async (duration) => {
    const updated = await api.finish(conversation.id, duration);
    setConversation(updated);
    setScreen('insights');
  };

  const openHistory = async () => { setHistory(await api.history(person?.id)); setScreen('history'); };

  const openConversation = async (id) => {
    const full = await api.getConversation(id);
    setConversation(full);
    setMessages(full.messages);
    setScreen('insights');
  };

  return (
    <div className="stage">
      <div className="phone"><div className="phone-in">
        <div className="statusbar"><span>9:41</span><span className="brand">Rehearsal</span><span>●●●</span></div>

        {screen === 'choose' && (
          <ChooseScreen people={people} onPick={pickPerson} onAdd={addPerson} />
        )}
        {screen === 'describe' && (
          <DescribeScreen person={person} situation={situation} setSituation={setSituation}
            onStart={startCall} onBack={() => setScreen('choose')} onHistory={openHistory} />
        )}
        {screen === 'call' && (
          <CallScreen person={person} conversation={conversation}
            messages={messages} setMessages={setMessages} onEnd={endCall} />
        )}
        {screen === 'insights' && conversation && (
          <InsightsScreen conv={conversation} onHome={() => setScreen('choose')}
            onTranscript={() => setScreen('transcript')} />
        )}
        {screen === 'transcript' && (
          <TranscriptScreen conv={conversation} messages={messages}
            onBack={() => setScreen('insights')} onNew={() => setScreen('choose')} />
        )}
        {screen === 'history' && (
          <HistoryScreen history={history} person={person} onOpen={openConversation} onBack={() => setScreen('describe')} />
        )}
      </div></div>
    </div>
  );
}

function ChooseScreen({ people, onPick, onAdd }) {
  return (
    <div className="scr">
      <div className="hd"><div className="ttl">Choose someone</div><div className="sub">Who do you need to talk to?</div></div>
      <div className="people">
        {people.slice(0, 3).map((p, i) => (
          <div className="person" key={p.id} onClick={() => onPick(p)}>
            <div className="pcircle" style={{ background: colorFor(i) + '2e', color: colorFor(i) }}>{p.name[0]}</div>
            <div className="pname">{p.name}</div>
          </div>
        ))}
      </div>
      <div className="addnew" onClick={onAdd}><span style={{ fontSize: 18 }}>＋</span> Add new person</div>
    </div>
  );
}

function DescribeScreen({ person, situation, setSituation, onStart, onBack, onHistory }) {
  return (
    <div className="scr">
      <div className="hd">
        <div className="back" onClick={onBack}>‹ Back</div>
        <div className="ttl">{person.name}</div><div className="sub">Tell us about it…</div>
      </div>
      <textarea className="ta" placeholder="What happened? What do you want to say?"
        value={situation} onChange={(e) => setSituation(e.target.value)} />
      <div className="reltag">Relationship: {person.relationship || '—'}</div>
      <div className="callbtn" onClick={onStart}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><path d="M6.5 3h3l1.5 4.5L9 9.5a12 12 0 005.5 5.5l2-2 4.5 1.5v3a2 2 0 01-2 2A16 16 0 014 5a2 2 0 012-2z" stroke="#0e0e1a" strokeWidth="2" strokeLinejoin="round" /></svg>
      </div>
      <div className="calltext">Tap to start the rehearsal call</div>
      <div className="prev" onClick={onHistory}>↺ Previous conversations</div>
    </div>
  );
}

function CallScreen({ person, conversation, messages, setMessages, onEnd }) {
  const [secs, setSecs] = useState(0);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const timer = useRef(null);
  const recog = useRef(null);
  const pendingText = useRef('');
  const busyRef = useRef(false);
  const activeRef = useRef(true);
  const sendRef = useRef(null);

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const speak = (text) => new Promise((resolve) => {
    if (!window.speechSynthesis || !text) { resolve(); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.onend = resolve;
    u.onerror = resolve;
    window.speechSynthesis.speak(u);
  });

  const send = async (text) => {
    if (!text.trim() || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    recog.current?.abort();
    setMessages((m) => [...m, { role: 'me', content: text }]);
    setInput('');
    const data = await api.sendTurn(conversation.id, text);
    const reply = data?.reply;
    if (reply) setMessages((m) => [...m, { role: 'them', content: reply }]);
    await speak(reply);
    busyRef.current = false;
    setBusy(false);
  };
  sendRef.current = send;

  // Load initial messages from DB and speak the first coach message
  useEffect(() => {
    api.getConversation(conversation.id).then((full) => {
      const msgs = full.messages || [];
      setMessages(msgs);
      const first = msgs.find((m) => m.role === 'them');
      if (first) {
        busyRef.current = true;
        setBusy(true);
        speak(first.content).then(() => { busyRef.current = false; setBusy(false); });
      }
    });
  }, []);

  // Timer
  useEffect(() => {
    timer.current = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(timer.current);
  }, []);

  // Speech recognition: auto-start whenever not busy and not already listening
  useEffect(() => {
    const w = /** @type {any} */ (window);
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = false;
    r.interimResults = true;
    r.lang = 'en-US';
    r.onstart = () => setListening(true);
    r.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setInput(text);
      if (e.results[e.results.length - 1].isFinal) pendingText.current = text;
    };
    r.onend = () => {
      setListening(false);
      const text = pendingText.current.trim();
      pendingText.current = '';
      setInput('');
      if (text) sendRef.current(text);
    };
    r.onerror = () => setListening(false);
    recog.current = r;
    return () => { activeRef.current = false; r.abort(); };
  }, []);

  useEffect(() => {
    if (!busy && !listening && activeRef.current) {
      const t = setTimeout(() => {
        if (!busyRef.current && activeRef.current) try { recog.current?.start(); } catch {}
      }, 300);
      return () => clearTimeout(t);
    }
  }, [busy, listening]);

  return (
    <div className="call-wrap">
      <div className="call-name">{person.name}</div>
      <div className="timer">{fmt(secs)}</div>
      <div className="call-avatar">{person.name[0]}</div>
      <div className="wave" style={{ opacity: listening ? 1 : busy ? 0.4 : 0.15 }}>
        {Array.from({ length: 7 }).map((_, i) => <span key={i} style={{ animationDelay: `${i * 0.12}s` }} />)}
      </div>
      <div className="mini-transcript">
        {messages.slice(-3).map((m, i) => (
          <div key={i} className={`mini ${m.role}`}>{m.content}</div>
        ))}
        {busy && <div className="mini them">…</div>}
      </div>
      <div className="call-input">
        <input value={input}
          placeholder={listening ? 'Listening…' : busy ? 'Coach is replying…' : 'Type or say something…'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !busy && send(input)} />
        <button onClick={() => send(input)}>↑</button>
      </div>
      <div className="endbtn" onClick={() => {
        activeRef.current = false;
        recog.current?.abort();
        window.speechSynthesis?.cancel();
        onEnd(fmt(secs));
      }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M6.5 3h3l1.5 4.5L9 9.5a12 12 0 005.5 5.5l2-2 4.5 1.5v3a2 2 0 01-2 2A16 16 0 014 5a2 2 0 012-2z" stroke="#fff" strokeWidth="2" strokeLinejoin="round" transform="rotate(135 12 12)" /></svg>
      </div>
      <div className="hint">End call to see your insights</div>
    </div>
  );
}

function InsightsScreen({ conv, onHome, onTranscript }) {
  const { styles, blocks, styleNotes } = resolveInsights(conv);
  const summary = displayIssueSummary(conv);
  return (
    <div className="scr">
      <div className="topbar"><div className="iconbtn" onClick={onHome}>⌂</div></div>
      <div className="conv-ttl">{displayHeadline(conv)}</div>
      {summary && <p className="conv-summary">{summary}</p>}
      <div className="conv-meta">with {conv.person_name || ''} · {conv.duration} · {conv.created_at?.slice(0, 10)}</div>
      <div className="ins-scroll">
        <p className="styles-intro">{STYLES_INTRO}</p>
        <a
          className="styles-ref"
          href="https://www.scottishconflictresolution.org.uk/learning-zone-communication-styles"
          target="_blank"
          rel="noopener noreferrer"
        >
          Communication styles guide (SCCR) ↗
        </a>
        <StylePieChart styles={styles} styleNotes={styleNotes} meters={STYLE_METERS} />
        <div className="label">Insights</div>
        {blocks.map((block, i) => (
          <InsightBlock key={i} block={block} />
        ))}
        <div className="viewtx" onClick={onTranscript}>View full transcript →</div>
      </div>
    </div>
  );
}

function DidWellBlock({ block }) {
  const meta = BLOCK_META.did_well;
  const instances =
    block.instances ||
    (block.quote ? [{ quote: block.quote, why: block.why }] : []);
  return (
    <div className="icard">
      <div className="icard-h">
        <span className="dot" style={{ background: meta.color }} />
        <span className="icard-t" style={{ color: meta.color }}>{meta.title}</span>
      </div>
      {instances.map((inst, i) => (
        <div key={i} className={i > 0 ? 'did-well-item' : undefined}>
          <div className="icard-quote">“{inst.quote}”</div>
          {inst.why && <div className="icard-b">{inst.why}</div>}
        </div>
      ))}
    </div>
  );
}

function InsightBlock({ block }) {
  if (block.type === 'legacy') {
    return (
      <>
        {block.tend && <InsightCard color="#e8a23d" title="You tend to…" body={block.tend} />}
        {block.try && <InsightCard color="#b8a0d4" title="Try to…" body={block.try} />}
        {block.used && <InsightCard color="#9b8cf0" title="You used…" body={block.used} />}
      </>
    );
  }
  if (block.type === 'did_well' || block.type === 'went_well') {
    return <DidWellBlock block={block} />;
  }
  const meta = BLOCK_META[block.type] || { title: block.type, color: '#b8a0d4' };
  return (
    <div className="icard">
      <div className="icard-h"><span className="dot" style={{ background: meta.color }} /><span className="icard-t" style={{ color: meta.color }}>{meta.title}</span></div>
      <div className="icard-quote">“{block.quote}”</div>
      {block.why && <div className="icard-b">{block.why}</div>}
      {block.instead && (
        <div className="icard-instead"><span className="icard-instead-lbl">Try instead</span> “{block.instead}”</div>
      )}
    </div>
  );
}

function InsightCard({ color, title, body }) {
  return (
    <div className="icard">
      <div className="icard-h"><span className="dot" style={{ background: color }} /><span className="icard-t" style={{ color }}>{title}</span></div>
      <div className="icard-b">{body}</div>
    </div>
  );
}

function TranscriptScreen({ conv, messages, onBack, onNew }) {
  return (
    <div className="scr">
      <div className="hd"><div className="back" onClick={onBack}>‹ Insights</div>
        <div className="ttl" style={{ fontSize: 19 }}>Transcript</div>
        <div className="sub">{conv.title} · with {conv.person_name || ''}</div></div>
      <div className="tx-scroll">
        {messages.map((m, i) => (
          <div key={i} className={`bub ${m.role}`}>
            <div className="bub-who">{m.role === 'me' ? 'Me' : conv.person_name}</div>{m.content}
          </div>
        ))}
      </div>
      <button className="cta" onClick={onBack}>Back to insights</button>
      <button className="cta ghost" onClick={onNew}>New rehearsal</button>
    </div>
  );
}

function HistoryScreen({ history, person, onOpen, onBack }) {
  return (
    <div className="scr">
      <div className="hd"><div className="back" onClick={onBack}>‹ Back</div>
        <div className="ttl" style={{ fontSize: 19 }}>{person ? `With ${person.name}` : 'Previous conversations'}</div>
        <div className="sub">Your past rehearsals</div></div>
      <div className="hist">
        {history.length === 0 && <div className="empty">{person ? `No rehearsals with ${person.name} yet.` : 'No rehearsals yet — finish a call to see it here.'}</div>}
        {history.map((c, i) => (
          <div className="hrow" key={c.id} onClick={() => onOpen(c.id)}>
            <div className="hav" style={{ background: colorFor(i) + '2e', color: colorFor(i) }}>{c.person_name[0]}</div>
            <div className="hinfo">
              <div className="htitle">{c.title}</div>
              <div className="hmeta">{c.person_name} · {c.duration} · {c.created_at?.slice(0, 10)}</div>
            </div>
            <div className="htension" style={{ background: assertiveColor(c.assertive ?? c.tension) + '22', color: assertiveColor(c.assertive ?? c.tension) }}>{c.assertive ?? c.tension}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}
