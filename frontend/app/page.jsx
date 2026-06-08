'use client';

import { useEffect, useRef, useState } from 'react';
import {
  displayHeadline, displayIssueSummary, resolveInsights, STYLE_METERS,
} from './insightsView.js';
import { configureCoachSpeech, speakCoachText, stopCoachSpeech } from './coachSpeech.js';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const SPEECH_SILENCE_MS = 3000;

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

  useEffect(() => {
    configureCoachSpeech(API);
    api.getPeople().then(setPeople);
  }, []);

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
    setMessages(conv.messages || []);
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
        <div className="statusbar"><span>9:41</span><span className="brand">Bridge</span><span>●●●</span></div>

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
      <div className="calltext">Tap to start your coaching session</div>
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
  const recognitionBaseText = useRef('');
  const silenceTimer = useRef(null);
  const busyRef = useRef(false);
  const activeRef = useRef(true);
  const sendRef = useRef(null);

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const scheduleSpeechSend = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    pendingText.current = trimmed;
    clearTimeout(silenceTimer.current);
    silenceTimer.current = setTimeout(() => {
      const finalText = pendingText.current.trim();
      pendingText.current = '';
      recognitionBaseText.current = '';
      silenceTimer.current = null;
      setInput('');
      if (finalText && activeRef.current) sendRef.current(finalText);
    }, SPEECH_SILENCE_MS);
  };

  const send = async (text) => {
    if (!text.trim() || busyRef.current) return;
    clearTimeout(silenceTimer.current);
    silenceTimer.current = null;
    pendingText.current = '';
    recognitionBaseText.current = '';
    busyRef.current = true;
    setBusy(true);
    recog.current?.abort();
    setMessages((m) => [...m, { role: 'me', content: text }]);
    setInput('');
    const data = await api.sendTurn(conversation.id, text);
    const reply = data?.reply;
    if (reply) {
      const speakPromise = speakCoachText(reply, { audioBase64: data?.audio });
      setMessages((m) => [...m, { role: 'them', content: reply }]);
      await speakPromise;
    }
    busyRef.current = false;
    setBusy(false);
  };
  sendRef.current = send;

  useEffect(() => {
    const first = messages.find((m) => m.role === 'them');
    if (first) {
      busyRef.current = true;
      setBusy(true);
      speakCoachText(first.content, { audioBase64: conversation?.opening_audio }).then(() => {
        busyRef.current = false;
        setBusy(false);
      });
    }
  }, []);

  useEffect(() => () => stopCoachSpeech(), []);

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
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-US';
    r.onstart = () => setListening(true);
    r.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      text = `${recognitionBaseText.current}${text}`.trim();
      setInput(text);
      scheduleSpeechSend(text);
    };
    r.onend = () => {
      setListening(false);
      if (pendingText.current.trim() && !silenceTimer.current) scheduleSpeechSend(pendingText.current);
    };
    r.onerror = () => setListening(false);
    recog.current = r;
    return () => {
      activeRef.current = false;
      clearTimeout(silenceTimer.current);
      r.abort();
    };
  }, []);

  useEffect(() => {
    if (!busy && !listening && activeRef.current) {
      const t = setTimeout(() => {
        if (!busyRef.current && activeRef.current) {
          recognitionBaseText.current = pendingText.current ? `${pendingText.current} ` : '';
          try { recog.current?.start(); } catch {}
        }
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
        clearTimeout(silenceTimer.current);
        recog.current?.abort();
        stopCoachSpeech();
        onEnd(fmt(secs));
      }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M6.5 3h3l1.5 4.5L9 9.5a12 12 0 005.5 5.5l2-2 4.5 1.5v3a2 2 0 01-2 2A16 16 0 014 5a2 2 0 012-2z" stroke="#fff" strokeWidth="2" strokeLinejoin="round" transform="rotate(135 12 12)" /></svg>
      </div>
      <div className="hint">End call to see your insights</div>
    </div>
  );
}

const HORSEMAN_INTRO = {
  critical: 'You made this sound like a character attack instead of naming the specific thing that happened:',
  contemptuous: 'You let mockery or dismissal come through here, which can shut the conversation down:',
  defensive: 'You sounded like you were deflecting instead of staying with what was said:',
  stonewalling: 'You sounded like you were shutting down instead of staying in the conversation:',
};

function InsightsScreen({ conv, onHome, onTranscript }) {
  const { styles, horseman, didWell, styleNotes } = resolveInsights(conv);
  const summary = displayIssueSummary(conv);
  const horsemen = horseman || [];
  const isGood = horsemen.length === 0;
  const dominant = STYLE_METERS.reduce((a, m) => styles[m.key] > styles[a.key] ? m : a, STYLE_METERS[0]);
  const dominantNotes = styleNotes?.[dominant.key]?.instances || [];

  return (
    <div className="scr">
      <div className="topbar"><div className="iconbtn" onClick={onHome}>{'⌂'}</div></div>
      <div className="ins-coach-line">
        {isGood ? "You handled this well. Good work." : "You did some things well. A few moments are worth noticing."}
      </div>
      <div className="conv-ttl">{displayHeadline(conv)}</div>
      {summary && <p className="conv-summary">{summary}</p>}
      <div className="conv-meta">{'with ' + (conv.person_name || '') + ' · ' + conv.duration}</div>
      <div className="ins-scroll">
        {didWell && <DidWellSection block={didWell} />}
        {horsemen.map((b, i) => <WatchOutSection key={i} block={b} />)}
        <StyleNoteSection meter={dominant} value={styles[dominant.key]} instances={dominantNotes} />
        <div className="viewtx" onClick={onTranscript}>See full transcript →</div>
      </div>
    </div>
  );
}

function DidWellSection({ block }) {
  const instances = block.instances || (block.quote ? [{ quote: block.quote, why: block.why }] : []);
  return (
    <div className="ins-section">
      <div className="ins-section-lbl">What you did well</div>
      {instances.map((inst, i) => (
        <div key={i} className="ins-moment">
          <div className="ins-quote">"{inst.quote}"</div>
          {inst.why && <div className="ins-note">{inst.why}</div>}
        </div>
      ))}
    </div>
  );
}

function WatchOutSection({ block }) {
  return (
    <div className="ins-section ins-watchout">
      <div className="ins-section-lbl">A moment to watch</div>
      <div className="ins-note">{HORSEMAN_INTRO[block.type] || 'You used a pattern worth watching here:'}</div>
      <div className="ins-quote">"{block.quote}"</div>
      {block.instead && <div className="ins-instead">You could try: "{block.instead}"</div>}
    </div>
  );
}

function StyleNoteSection({ meter, value, instances = [] }) {
  return (
    <div className="ins-section">
      <div className="ins-section-lbl">How you came across</div>
      <div className="ins-style-name" style={{ color: meter.color }}>{meter.label} ({value}%)</div>
      <div className="ins-note">{meter.description}</div>
      {instances.map((inst, i) => (
        <div key={i} className={i === 0 ? 'style-instance-first' : 'style-instance'}>
          <div className="style-example">"{inst.quote}"</div>
          {inst.why && <div className="style-reason">{inst.why}</div>}
        </div>
      ))}
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
      <button className="cta ghost" onClick={onNew}>New conversation</button>
    </div>
  );
}

function HistoryScreen({ history, person, onOpen, onBack }) {
  return (
    <div className="scr">
      <div className="hd"><div className="back" onClick={onBack}>‹ Back</div>
        <div className="ttl" style={{ fontSize: 19 }}>{person ? `With ${person.name}` : 'Previous conversations'}</div>
        <div className="sub">Your past conversations</div></div>
      <div className="hist">
        {history.length === 0 && <div className="empty">{person ? `No conversations with ${person.name} yet.` : 'No conversations yet — finish a session to see it here.'}</div>}
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
