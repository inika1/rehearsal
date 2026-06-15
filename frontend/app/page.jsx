'use client';

import { useEffect, useRef, useState } from 'react';
import {
  displayHeadline, displayIssueSummary, resolveInsights, STYLE_METERS,
} from './insightsView.js';
import { configureCoachSpeech, speakCoachText, stopCoachSpeech, unlockAudio } from './coachSpeech.js';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const SPEECH_SILENCE_MS = 3000;

let _token = null;
const h = (extra = {}) => ({
  'content-type': 'application/json',
  ...(_token ? { authorization: `Bearer ${_token}` } : {}),
  ...extra,
});
const j = async (r) => {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `Request failed: ${r.status}`);
  return data;
};
const api = {
  setToken: (t) => { _token = t; },
  login: (email, password) =>
    fetch(`${API}/api/auth/login`, { method: 'POST', headers: h(), body: JSON.stringify({ email, password }) }).then(j),
  signup: (email, password) =>
    fetch(`${API}/api/auth/signup`, { method: 'POST', headers: h(), body: JSON.stringify({ email, password }) }).then(j),
  getPeople: () => fetch(`${API}/api/people`, { headers: h() }).then(j),
  addPerson: (name, relationship) =>
    fetch(`${API}/api/people`, { method: 'POST', headers: h(), body: JSON.stringify({ name, relationship }) }).then(j),
  startConversation: (person_id, title, situation) =>
    fetch(`${API}/api/conversations`, { method: 'POST', headers: h(), body: JSON.stringify({ person_id, title, situation }) }).then(j),
  sendTurn: (id, content) =>
    fetch(`${API}/api/conversations/${id}/turn`, { method: 'POST', headers: h(), body: JSON.stringify({ content }) }).then(j),
  finish: (id, duration) =>
    fetch(`${API}/api/conversations/${id}/finish`, { method: 'POST', headers: h(), body: JSON.stringify({ duration }) }).then(j),
  history: (personId) => fetch(`${API}/api/conversations${personId ? `?person_id=${personId}` : ''}`, { headers: h() }).then(j),
  getConversation: (id) => fetch(`${API}/api/conversations/${id}`, { headers: h() }).then(j),
};

const AVATAR_COLORS = ['#c4a96e', '#b8a0d4', '#9b8cf0', '#e8a23d', '#3ec46a'];
const colorFor = (i) => AVATAR_COLORS[i % AVATAR_COLORS.length];

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState('choose');
  const [people, setPeople] = useState([]);
  const [person, setPerson] = useState(null);
  const [situation, setSituation] = useState('');
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [history, setHistory] = useState([]);
  const [tutorialStep, setTutorialStep] = useState(null);
  const [addingPerson, setAddingPerson] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRel, setNewRel] = useState('');

  useEffect(() => {
    configureCoachSpeech(API);
    const token = localStorage.getItem('auth_token');
    if (token) {
      api.setToken(token);
      api.getPeople().then((data) => {
        if (Array.isArray(data)) {
          setPeople(data);
          const stored = localStorage.getItem('auth_user');
          setUser(stored ? JSON.parse(stored) : { token });
        } else {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('auth_user');
          api.setToken(null);
        }
        setAuthReady(true);
      }).catch(() => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        api.setToken(null);
        setAuthReady(true);
      });
    } else {
      setAuthReady(true);
    }
  }, []);

  const handleAuth = async (token, userObj, isNew = false) => {
    api.setToken(token);
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(userObj));
    const data = await api.getPeople().catch(() => []);
    if (Array.isArray(data)) setPeople(data);
    setUser(userObj);
    if (isNew && !localStorage.getItem('tutorial_done')) setTutorialStep(0);
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    api.setToken(null);
    setUser(null);
    setPeople([]);
    setPerson(null);
    setConversation(null);
    setMessages([]);
    setScreen('choose');
    setTutorialStep(null);
  };

  const skipTutorial = () => {
    localStorage.setItem('tutorial_done', '1');
    setTutorialStep(null);
  };

  const restartTutorial = () => setTutorialStep(0);

  const pickPerson = (p) => {
    setPerson(p);
    setScreen('describe');
    if (tutorialStep === 2) setTutorialStep(3);
  };

  const openAddPerson = () => {
    setNewName('');
    setNewRel('');
    setAddingPerson(true);
  };

  const confirmAddPerson = async () => {
    if (!newName.trim()) return;
    const p = await api.addPerson(newName.trim(), newRel.trim());
    setPeople([p, ...people]);
    setNewName('');
    setNewRel('');
    setAddingPerson(false);
    if (tutorialStep === 1) setTutorialStep(2);
  };

  const doStartCall = async () => {
    unlockAudio(); // must run synchronously inside the tap gesture to satisfy iOS autoplay policy
    const title = situation.split(' ').slice(0, 3).join(' ') || 'Untitled';
    const conv = await api.startConversation(person.id, title, situation);
    setConversation(conv);
    setMessages(conv.messages || []);
    setScreen('call');
  };

  const startCall = async () => {
    await doStartCall();
  };

  const endCall = async (duration) => {
    const updated = await api.finish(conversation.id, duration);
    setConversation(updated);
    setScreen('insights');
    if (tutorialStep === 3 || tutorialStep === 4) setTutorialStep(5);
  };

  const openHistory = async () => { setHistory(await api.history(person?.id)); setScreen('history'); };

  const openConversation = async (id) => {
    const full = await api.getConversation(id);
    setConversation(full);
    setMessages(full.messages);
    setScreen('insights');
  };

  if (!authReady) return <div className="stage"><div className="phone"><div className="phone-in" /></div></div>;

  const goHome = () => {
    if (tutorialStep === 5) setTutorialStep(6);
    setScreen('choose');
  };

  return (
    <div className="stage">
      <div className="phone"><div className="phone-in" style={{ position: 'relative' }}>
        <div className="statusbar"><span>9:41</span><span className="brand">Bridge</span><span>●●●</span></div>

        {!user && <LoginScreen onAuth={handleAuth} />}

        {user && screen === 'choose' && (
          <ChooseScreen people={people} onPick={pickPerson} onAdd={openAddPerson}
            userEmail={user?.email} onLogout={handleLogout} onHelp={restartTutorial} />
        )}
        {user && screen === 'describe' && (
          <DescribeScreen person={person} situation={situation} setSituation={setSituation}
            onStart={startCall} onBack={() => setScreen('choose')} onHistory={openHistory} />
        )}
        {user && screen === 'call' && (
          <CallScreen person={person} conversation={conversation}
            messages={messages} setMessages={setMessages} onEnd={endCall} />
        )}
        {user && screen === 'insights' && conversation && (
          <InsightsScreen conv={conversation} onHome={goHome}
            onTranscript={() => setScreen('transcript')} />
        )}
        {user && screen === 'transcript' && (
          <TranscriptScreen conv={conversation} messages={messages}
            onBack={() => setScreen('insights')} onNew={goHome} />
        )}
        {user && screen === 'history' && (
          <HistoryScreen history={history} person={person} onOpen={openConversation} onBack={() => setScreen('describe')} />
        )}

        {/* Add person modal */}
        {addingPerson && (
          <AddPersonModal
            name={newName} rel={newRel}
            onNameChange={setNewName} onRelChange={setNewRel}
            onAdd={confirmAddPerson}
            onCancel={() => {
              setAddingPerson(false);
              setNewName('');
              setNewRel('');
              if (tutorialStep === 1) skipTutorial();
            }}
          />
        )}

        {/* Tutorial: Welcome (step 0) */}
        {user && tutorialStep === 0 && (
          <TutorialCard
            tag="Getting started · 1 of 5"
            title="Welcome to Bridge"
            body="Let's walk you through your first session. Start by adding the person you need to have a difficult conversation with."
            primaryLabel="Add your first person →"
            onPrimary={() => { setTutorialStep(1); openAddPerson(); }}
            skipLabel="Skip tutorial"
            onSkip={skipTutorial}
          />
        )}

        {/* Tutorial: Select person (step 2) */}
        {user && tutorialStep === 2 && screen === 'choose' && (
          <TutorialBanner
            text={`Great! Now tap on ${people[0]?.name ?? 'them'} to continue.`}
            onSkip={skipTutorial}
          />
        )}

        {/* Tutorial: Context is optional + pre-call explanation (step 3) */}
        {user && tutorialStep === 3 && screen === 'describe' && (
          <TutorialBanner
            text={`Optionally describe what happened to give your coach context — or leave it blank. Your session works like a phone call: speak naturally and your coach will guide you. Tap the green button to start, then hang up when you're done.`}
            onSkip={skipTutorial}
          />
        )}

        {/* Tutorial: Insights explanation (step 5) */}
        {user && tutorialStep === 5 && screen === 'insights' && (
          <TutorialBanner
            text="After each session you'll see how you communicated — what went well, moments to watch, and your dominant style. Tap 'See full transcript' below to read the whole conversation."
            actionLabel="Got it"
            onAction={() => setTutorialStep(6)}
            onSkip={skipTutorial}
          />
        )}

        {/* Tutorial: History (step 6) */}
        {user && tutorialStep === 6 && screen === 'choose' && (
          <TutorialBanner
            text="To review past sessions, tap on a contact then 'Previous conversations'. If you ever need this walkthrough again, tap the ? button in the top right."
            actionLabel="Let's go"
            onAction={skipTutorial}
          />
        )}
      </div></div>
    </div>
  );
}

function LoginScreen({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    setError('');
    if (!email.trim() || !password) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    try {
      const result = mode === 'signup'
        ? await api.signup(email.trim(), password)
        : await api.login(email.trim(), password);
      await onAuth(result.token, result.user, mode === 'signup');
    } catch (err) { setError(err?.message || 'Something went wrong. Please try again.'); }
    setLoading(false);
  };

  const tryDemo = async () => {
    setError('');
    setLoading(true);
    try {
      let result = await api.login('demo@bridge.app', 'demo1234').catch(() => null);
      if (!result?.token) result = await api.signup('demo@bridge.app', 'demo1234');
      await onAuth(result.token, result.user);
    } catch (err) { setError(err?.message || 'Could not load demo. Try again.'); }
    setLoading(false);
  };

  return (
    <div className="scr login-wrap">
      <div className="login-brand">Bridge</div>
      <div className="login-tagline">Closing the gap between intention and understanding</div>
      <form className="login-card" onSubmit={submit}>
        <input className="login-input" type="email" placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <input className="login-input" type="password" placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        {error && <div className="login-error">{error}</div>}
        <button className="login-btn" type="submit" disabled={loading}>
          {loading ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <button className="login-switch" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>
        {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
      </button>
      <div className="login-divider"><span>or</span></div>
      <button className="demo-btn" onClick={tryDemo} disabled={loading}>
        {loading ? '…' : 'Try sample login'}
      </button>
    </div>
  );
}

function ChooseScreen({ people, onPick, onAdd, onLogout, onHelp }) {
  return (
    <div className="scr">
      <div className="hd">
        <div className="choose-header">
          <div>
            <div className="ttl">Who do you need help talking to?</div>
            <div className="sub">Pick someone you need to have a difficult conversation with</div>
          </div>
          <button className="help-btn" onClick={onHelp} title="Restart tutorial">?</button>
        </div>
      </div>
      <div className="people">
        {people.slice(0, 3).map((p, i) => (
          <div className="person" key={p.id} onClick={() => onPick(p)}>
            <div className="pcircle" style={{ background: colorFor(i) + '2e', color: colorFor(i) }}>{p.name[0]}</div>
            <div className="pname">{p.name}</div>
          </div>
        ))}
      </div>
      <div className="addnew" onClick={onAdd}><span style={{ fontSize: 18 }}>＋</span> Add new person</div>
      <button className="logout-btn" onClick={onLogout}>Log out</button>
    </div>
  );
}

function DescribeScreen({ person, situation, setSituation, onStart, onBack, onHistory }) {
  return (
    <div className="scr">
      <div className="hd">
        <div className="back" onClick={onBack}>‹ Back</div>
        <div className="ttl">{person.name}</div><div className="sub">Tell your coach what's going on</div>
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
  const [paused, setPaused] = useState(false);
  const timer = useRef(null);
  const inputRef = useRef(null);
  const recog = useRef(null);
  const pendingText = useRef('');
  const recognitionBaseText = useRef('');
  const silenceTimer = useRef(null);
  const busyRef = useRef(false);
  const activeRef = useRef(true);
  const pausedRef = useRef(false);
  const pendingCoachRef = useRef(null);
  const coachDeliveryRef = useRef(null);
  const sendRef = useRef(null);
  const secsRef = useRef(0);

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const stopCallAudio = ({ updateState = true } = {}) => {
    activeRef.current = false;
    busyRef.current = false;
    clearTimeout(silenceTimer.current);
    silenceTimer.current = null;
    pendingText.current = '';
    recognitionBaseText.current = '';
    if (updateState) setListening(false);
    recog.current?.abort();
    stopCoachSpeech();
  };

  const deliverCoachReply = async ({ reply, audio, done = false }) => {
    const text = reply || "Go on — tell me more.";
    coachDeliveryRef.current = { reply: text, audio, done };
    setMessages((m) => {
      const last = m[m.length - 1];
      if (last?.role === 'them' && last.content === text) return m;
      return [...m, { role: 'them', content: text }];
    });
    busyRef.current = true;
    setBusy(true);
    await speakCoachText(text, { audioBase64: audio });
    if (!activeRef.current) return;
    if (pausedRef.current) {
      pendingCoachRef.current = { reply: text, audio, done };
      busyRef.current = false;
      setBusy(false);
      return;
    }
    coachDeliveryRef.current = null;
    pendingCoachRef.current = null;
    busyRef.current = false;
    setBusy(false);
  };

  const flushPendingCoach = async () => {
    const pending = pendingCoachRef.current;
    if (!pending || pausedRef.current || !activeRef.current) return;
    pendingCoachRef.current = null;
    await deliverCoachReply(pending);
  };

  const pauseCall = () => {
    if (pausedRef.current || !activeRef.current) return;
    pausedRef.current = true;
    setPaused(true);
    clearTimeout(silenceTimer.current);
    silenceTimer.current = null;
    pendingText.current = '';
    recognitionBaseText.current = '';
    recog.current?.abort();
    setListening(false);
    stopCoachSpeech();
    if (coachDeliveryRef.current) {
      pendingCoachRef.current = coachDeliveryRef.current;
    }
    busyRef.current = false;
    setBusy(false);
  };

  const resumeCall = () => {
    if (!activeRef.current || !pausedRef.current) return;
    pausedRef.current = false;
    setPaused(false);
    if (pendingCoachRef.current) flushPendingCoach();
  };

  const scheduleSpeechSend = (text) => {
    if (!activeRef.current || pausedRef.current) return;
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
      if (finalText && activeRef.current && !pausedRef.current) sendRef.current(finalText);
    }, SPEECH_SILENCE_MS);
  };

  const send = async (text) => {
    if (!text.trim() || busyRef.current || pausedRef.current) return;
    clearTimeout(silenceTimer.current);
    silenceTimer.current = null;
    pendingText.current = '';
    recognitionBaseText.current = '';
    busyRef.current = true;
    setBusy(true);
    recog.current?.abort();
    setMessages((m) => [...m, { role: 'me', content: text }]);
    setInput('');
    let payload = null;
    try {
      const data = await api.sendTurn(conversation.id, text);
      if (!activeRef.current) return;
      if (data?.reply) {
        payload = { reply: data.reply, audio: data?.audio, done: data?.done || false };
      }
    } catch (_) {}
    if (!activeRef.current) return;
    if (!payload) {
      busyRef.current = false;
      setBusy(false);
      return;
    }
    if (pausedRef.current) {
      pendingCoachRef.current = payload;
      busyRef.current = false;
      setBusy(false);
      return;
    }
    await deliverCoachReply(payload);
  };
  sendRef.current = send;

  useEffect(() => {
    const first = messages.find((m) => m.role === 'them');
    if (first) {
      const payload = { reply: first.content, audio: conversation?.opening_audio, done: false };
      if (pausedRef.current) {
        pendingCoachRef.current = payload;
        return;
      }
      deliverCoachReply(payload);
    }
  }, []);

  useEffect(() => () => stopCoachSpeech(), []);

  useEffect(() => {
    if (paused) return undefined;
    timer.current = setInterval(() => setSecs((s) => {
      secsRef.current = s + 1;
      return s + 1;
    }), 1000);
    return () => clearInterval(timer.current);
  }, [paused]);

  // Speech recognition: auto-start whenever not busy and not already listening
  useEffect(() => {
    const w = /** @type {any} */ (window);
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-US';
    r.onstart = () => {
      if (!activeRef.current || pausedRef.current) {
        r.abort();
        return;
      }
      setListening(true);
    };
    r.onresult = (e) => {
      if (!activeRef.current || pausedRef.current) return;
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      text = `${recognitionBaseText.current}${text}`.trim();
      setInput(text);
      scheduleSpeechSend(text);
    };
    r.onend = () => {
      setListening(false);
      if (!activeRef.current || pausedRef.current) return;
      if (pendingText.current.trim() && !silenceTimer.current) scheduleSpeechSend(pendingText.current);
    };
    r.onerror = () => setListening(false);
    recog.current = r;
    return () => {
      stopCallAudio({ updateState: false });
    };
  }, []);

  useEffect(() => {
    if (!busy && !listening && activeRef.current && !paused && !pendingCoachRef.current) {
      const t = setTimeout(() => {
        if (!busyRef.current && activeRef.current && !pausedRef.current && !pendingCoachRef.current) {
          recognitionBaseText.current = pendingText.current ? `${pendingText.current} ` : '';
          try { recog.current?.start(); } catch {}
        }
      }, 300);
      return () => clearTimeout(t);
    }
  }, [busy, listening, paused]);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = 'auto';
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 96)}px`;
    inputRef.current.scrollTop = inputRef.current.scrollHeight;
  }, [input]);

  return (
    <div className="call-wrap">
      <div className="call-name">{person.name}</div>
      <div className={`timer${paused ? ' timer-paused' : ''}`}>
        {paused ? `Paused · ${fmt(secs)}` : fmt(secs)}
      </div>
      <div className="call-avatar">{person.name[0]}</div>
      <div className="wave" style={{ opacity: paused ? 0.08 : listening ? 1 : busy ? 0.4 : 0.15 }}>
        {Array.from({ length: 7 }).map((_, i) => <span key={i} style={{ animationDelay: `${i * 0.12}s` }} />)}
      </div>
      <div className="mini-transcript">
        {messages.slice(-3).map((m, i) => (
          <div key={i} className={`mini ${m.role}`}>{m.content}</div>
        ))}
        {busy && <div className="mini them">…</div>}
      </div>
      <div className="call-input">
        <textarea ref={inputRef}
          value={input}
          rows={1}
          placeholder={
            paused ? 'Paused — tap resume to continue'
              : listening ? 'Listening…'
              : busy ? 'Coach is replying…'
              : 'Type or say something…'
          }
          disabled={paused || busy || listening}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !busy && !paused) {
              e.preventDefault();
              send(input);
            }
          }} />
        <button onClick={() => send(input)} disabled={paused || busy || listening}>↑</button>
      </div>
      <button
        type="button"
        className={`pausebtn${paused ? ' active' : ''}`}
        onClick={paused ? resumeCall : pauseCall}
      >
        {paused ? '▶ Resume' : '⏸ Pause'}
      </button>
      <div className="endbtn" onClick={() => {
        stopCallAudio();
        onEnd(fmt(secsRef.current));
      }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M6.5 3h3l1.5 4.5L9 9.5a12 12 0 005.5 5.5l2-2 4.5 1.5v3a2 2 0 01-2 2A16 16 0 014 5a2 2 0 012-2z" stroke="#fff" strokeWidth="2" strokeLinejoin="round" transform="rotate(135 12 12)" /></svg>
      </div>
      <div className="hint">
        {paused ? 'Session paused — resume when you\'re ready' : 'End call to see your insights'}
      </div>
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

function AddPersonModal({ name, rel, onNameChange, onRelChange, onAdd, onCancel }) {
  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-title">Add person</div>
        <input
          className="modal-input"
          placeholder="Name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          autoFocus
        />
        <input
          className="modal-input"
          placeholder="Relationship (e.g. flatmate)"
          value={rel}
          onChange={(e) => onRelChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onAdd(); }}
        />
        <div className="modal-actions">
          <button className="modal-cancel" onClick={onCancel}>Cancel</button>
          <button className="modal-confirm" onClick={onAdd}>Add</button>
        </div>
      </div>
    </div>
  );
}

function TutorialCard({ tag, title, body, primaryLabel, onPrimary, skipLabel, onSkip }) {
  return (
    <div className="tutorial-overlay">
      <div className="tutorial-card">
        {tag && <div className="tutorial-tag">{tag}</div>}
        <div className="tutorial-title">{title}</div>
        <div className="tutorial-body">{body}</div>
        <button className="tutorial-btn" onClick={onPrimary}>{primaryLabel}</button>
        {skipLabel && <button className="tutorial-skip" onClick={onSkip}>{skipLabel}</button>}
      </div>
    </div>
  );
}

function TutorialBanner({ text, actionLabel, onAction, onSkip }) {
  return (
    <div className="tutorial-banner">
      <div className="tutorial-banner-text">{text}</div>
      <div className="tutorial-banner-actions">
        {actionLabel && (
          <button className="tutorial-banner-btn" onClick={onAction}>{actionLabel}</button>
        )}
        {onSkip && (
          <button className="tutorial-banner-skip" onClick={onSkip}>Skip tour</button>
        )}
      </div>
    </div>
  );
}
