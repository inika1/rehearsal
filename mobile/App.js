import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import * as Speech from 'expo-speech';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text, TextInput, TouchableOpacity,
  View,
} from 'react-native';
import {
  assertiveColor, BLOCK_META, resolveInsights, STYLE_METERS, STYLES_INTRO,
} from './shared/insightsView.js';

// When testing on a physical device, change this to your machine's local IP.
// e.g. 'http://192.168.1.42:4000'
const API = 'https://rehearsal-production-5d15.up.railway.app';

const j = (r) => r.json();
const api = {
  getPeople: () => fetch(`${API}/api/people`).then(j),
  addPerson: (name, relationship) =>
    fetch(`${API}/api/people`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, relationship }),
    }).then(j),
  startConversation: (person_id, title, situation) =>
    fetch(`${API}/api/conversations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ person_id, title, situation }),
    }).then(j),
  sendTurn: (id, content) =>
    fetch(`${API}/api/conversations/${id}/turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content }),
    }).then(j),
  finish: (id, duration) =>
    fetch(`${API}/api/conversations/${id}/finish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ duration }),
    }).then(j),
  history: (personId) =>
    fetch(`${API}/api/conversations${personId ? `?person_id=${personId}` : ''}`).then(j),
  getConversation: (id) => fetch(`${API}/api/conversations/${id}`).then(j),
};

const AVATAR_COLORS = ['#c4a96e', '#b8a0d4', '#9b8cf0', '#e8a23d', '#3ec46a'];
const colorFor = (i) => AVATAR_COLORS[i % AVATAR_COLORS.length];
const tColor = (t) => (t >= 65 ? '#e54d4d' : t >= 45 ? '#e8a23d' : '#3ec46a');

export default function App() {
  const [screen, setScreen] = useState('choose');
  const [people, setPeople] = useState([]);
  const [person, setPerson] = useState(null);
  const [situation, setSituation] = useState('');
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [history, setHistory] = useState([]);
  const [addingPerson, setAddingPerson] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRel, setNewRel] = useState('');

  useEffect(() => { api.getPeople().then(setPeople); }, []);

  const pickPerson = (p) => { setPerson(p); setSituation(''); setScreen('describe'); };

  const addPerson = async () => {
    if (!newName.trim()) return;
    const p = await api.addPerson(newName.trim(), newRel.trim());
    setPeople([p, ...people]);
    setNewName('');
    setNewRel('');
    setAddingPerson(false);
  };

  const startCall = async () => {
    const title = situation.split(' ').slice(0, 3).join(' ') || 'Untitled';
    const conv = await api.startConversation(person.id, title, situation);
    const fullConv = await api.getConversation(conv.id);
    setConversation(fullConv);
    setMessages(fullConv.messages || []);
    setScreen('call');
  };

  const endCall = async (duration) => {
    const updated = await api.finish(conversation.id, duration);
    setConversation(updated);
    setScreen('insights');
  };

  const openHistory = async () => {
    setHistory(await api.history(person?.id));
    setScreen('history');
  };

  const openConversation = async (id) => {
    const full = await api.getConversation(id);
    setConversation(full);
    setMessages(full.messages);
    setScreen('insights');
  };

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="light" />

      <Modal visible={addingPerson} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Add person</Text>
            <TextInput
              style={s.modalInput}
              placeholder="Name"
              placeholderTextColor="rgba(255,255,255,.3)"
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />
            <TextInput
              style={s.modalInput}
              placeholder="Relationship (e.g. flatmate)"
              placeholderTextColor="rgba(255,255,255,.3)"
              value={newRel}
              onChangeText={setNewRel}
              onSubmitEditing={addPerson}
              returnKeyType="done"
            />
            <View style={s.modalActions}>
              <TouchableOpacity
                onPress={() => { setAddingPerson(false); setNewName(''); setNewRel(''); }}
                style={s.modalCancel}
              >
                <Text style={s.modalCancelTx}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={addPerson} style={s.modalConfirm}>
                <Text style={s.modalConfirmTx}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {screen === 'choose' && (
        <ChooseScreen people={people} onPick={pickPerson} onAdd={() => setAddingPerson(true)} />
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
        <HistoryScreen history={history} person={person}
          onOpen={openConversation} onBack={() => { setSituation(''); setScreen('describe'); }} />
      )}
    </SafeAreaView>
  );
}

function ChooseScreen({ people, onPick, onAdd }) {
  return (
    <View style={s.scr}>
      <View style={s.hd}>
        <Text style={s.ttl}>Choose someone</Text>
        <Text style={s.sub}>Who do you need to talk to?</Text>
      </View>

      <ScrollView contentContainerStyle={s.peopleScroll} style={{ flex: 1 }}>
        <View style={s.people}>
          {people.map((p, i) => (
            <TouchableOpacity key={p.id} onPress={() => onPick(p)} style={s.person}>
              <View style={[s.pcircle, { backgroundColor: colorFor(i) + '2e' }]}> 
                <Text style={[s.pcircleText, { color: colorFor(i) }]}>{p.name[0]}</Text>
              </View>
              <Text style={s.pname}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity onPress={onAdd} style={s.addnew}>
          <Text style={s.addnewTx}>＋  Add new person</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function DescribeScreen({ person, situation, setSituation, onStart, onBack, onHistory }) {
  return (
    <KeyboardAvoidingView style={s.scr} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.hd}>
        <TouchableOpacity onPress={onBack}>
          <Text style={s.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={s.ttl}>{person.name}</Text>
        <Text style={s.sub}>Tell us about it…</Text>
      </View>
      <TextInput
        style={s.ta}
        placeholder="What happened? What do you want to say?"
        placeholderTextColor="rgba(255,255,255,.3)"
        value={situation}
        onChangeText={setSituation}
        multiline
        textAlignVertical="top"
      />
      <Text style={s.reltag}>Relationship: {person.relationship || '—'}</Text>
      <TouchableOpacity onPress={onStart} style={s.callbtn}>
        <Text style={{ fontSize: 28 }}>📞</Text>
      </TouchableOpacity>
      <Text style={s.calltext}>Tap to start the rehearsal call</Text>
      <TouchableOpacity onPress={onHistory} style={s.prev}>
        <Text style={s.prevTx}>↺  Previous conversations</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

function WaveBar({ delay }) {
  const anim = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 30, duration: 500, delay,
          easing: Easing.inOut(Easing.ease), useNativeDriver: false,
        }),
        Animated.timing(anim, {
          toValue: 8, duration: 500,
          easing: Easing.inOut(Easing.ease), useNativeDriver: false,
        }),
      ])
    ).start();
  }, []);
  return <Animated.View style={[s.waveBar, { height: anim }]} />;
}

function CallScreen({ person, conversation, messages, setMessages, onEnd }) {
  const [secs, setSecs] = useState(0);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const timer = useRef(null);
  const scrollRef = useRef(null);
  const webRecognition = useRef(null);
  const busyRef = useRef(false);
  const activeRef = useRef(true);
  const sendRef = useRef(null);
  const secsRef = useRef(0);

  const fmt = (n) =>
    `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

  const speakText = (text) => new Promise((resolve) => {
    if (!text) { resolve(); return; }
    if (Platform.OS === 'web') {
      if (!window.speechSynthesis) { resolve(); return; }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.pitch = 1.05;
      const pickVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        u.voice =
          voices.find((v) => v.name === 'Samantha') ||
          voices.find((v) => v.name.includes('Google UK English Female')) ||
          voices.find((v) => v.lang === 'en-GB') ||
          voices.find((v) => v.lang.startsWith('en')) ||
          null;
        u.onend = resolve;
        u.onerror = resolve;
        window.speechSynthesis.speak(u);
      };
      if (window.speechSynthesis.getVoices().length) pickVoice();
      else window.speechSynthesis.addEventListener('voiceschanged', pickVoice, { once: true });
    } else {
      Speech.speak(text, {
        voice: 'com.apple.voice.compact.en-US.Samantha',
        pitch: 1.05,
        onDone: resolve,
        onStopped: resolve,
        onError: resolve,
      });
    }
  });

  const startListening = async () => {
    if (busyRef.current || !activeRef.current) return;
    setInput('');
    if (Platform.OS === 'web') {
      const w = /** @type {any} */ (window);
      const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
      if (!SR) return;
      const rec = new SR();
      rec.lang = 'en-US';
      rec.interimResults = true;
      rec.onstart = () => setListening(true);
      rec.onresult = (e) => {
        const text = Array.from(e.results).map((r) => r[0].transcript).join('');
        setInput(text);
        if (e.results[e.results.length - 1].isFinal && text.trim()) sendRef.current(text.trim());
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      webRecognition.current = rec;
      rec.start();
    } else {
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) return;
      setListening(true);
      ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: true });
    }
  };

  const sendText = async (text) => {
    if (!text || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    if (Platform.OS === 'web') webRecognition.current?.abort();
    else ExpoSpeechRecognitionModule.stop();
    setMessages((m) => [...m, { role: 'me', content: text }]);
    setInput('');
    const data = await api.sendTurn(conversation.id, text);
    const reply = data?.reply;
    const done = data?.done;
    if (reply) setMessages((m) => [...m, { role: 'them', content: reply }]);
    await speakText(reply);
    busyRef.current = false;
    setBusy(false);
    if (done) {
      activeRef.current = false;
      setTimeout(() => onEnd(fmt(secsRef.current)), 2000);
    }
  };
  sendRef.current = sendText;

  useSpeechRecognitionEvent('result', (event) => {
    if (Platform.OS === 'web') return;
    const text = event.results[0]?.transcript ?? '';
    setInput(text);
    if (event.isFinal && text.trim()) sendText(text.trim());
  });

  useSpeechRecognitionEvent('end', () => {
    if (Platform.OS !== 'web') setListening(false);
  });
  useSpeechRecognitionEvent('error', () => {
    if (Platform.OS !== 'web') setListening(false);
  });

  // Auto-start listening whenever idle
  useEffect(() => {
    if (!busy && !listening && activeRef.current) {
      const t = setTimeout(startListening, 300);
      return () => clearTimeout(t);
    }
  }, [busy, listening]);

  // Timer + load initial messages and speak first coach message
  useEffect(() => {
    timer.current = setInterval(() => setSecs((n) => { secsRef.current = n + 1; return n + 1; }), 1000);
    api.getConversation(conversation.id).then((full) => {
      const msgs = full.messages || [];
      setMessages(msgs);
      const first = msgs.find((m) => m.role === 'them');
      if (first) {
        busyRef.current = true;
        setBusy(true);
        speakText(first.content).then(() => { busyRef.current = false; setBusy(false); });
      }
    });
    return () => {
      activeRef.current = false;
      clearInterval(timer.current);
      ExpoSpeechRecognitionModule.stop();
      Speech.stop();
    };
  }, []);

  return (
    <KeyboardAvoidingView style={s.callWrap} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Text style={s.callName}>{person.name}</Text>
      <Text style={s.timer}>{fmt(secs)}</Text>
      <View style={s.callAvatar}>
        <Text style={s.callAvatarTx}>{person.name[0]}</Text>
      </View>
      <View style={s.wave}>
        {Array.from({ length: 7 }).map((_, i) => <WaveBar key={i} delay={i * 120} />)}
      </View>
      <ScrollView
        ref={scrollRef}
        style={s.miniTranscript}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd()}
      >
        {messages.slice(-3).map((m, i) => (
          <View key={i} style={[s.mini, m.role === 'me' ? s.miniMe : s.miniThem]}>
            <Text style={m.role === 'me' ? s.miniMeTx : s.miniThemTx}>{m.content}</Text>
          </View>
        ))}
        {busy && (
          <View style={[s.mini, s.miniThem]}>
            <Text style={s.miniThemTx}>…</Text>
          </View>
        )}
      </ScrollView>
      <View style={s.callInput}>
        <TextInput
          style={s.callInputField}
          value={input}
          placeholder={listening ? 'Listening…' : busy ? 'Coach is replying…' : 'Say something…'}
          placeholderTextColor={listening ? '#b8a0d4' : 'rgba(255,255,255,.3)'}
          onChangeText={setInput}
          onSubmitEditing={() => sendText(input.trim())}
          returnKeyType="send"
          editable={!listening && !busy}
        />
        <TouchableOpacity onPress={() => sendText(input.trim())} style={s.sendBtn}>
          <Text style={s.sendBtnTx}>↑</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={() => onEnd(fmt(secs))} style={s.endBtn}>
        <Text style={{ fontSize: 24 }}>📵</Text>
      </TouchableOpacity>
      <Text style={s.hint}>End call to see your insights</Text>
    </KeyboardAvoidingView>
  );
}

function StyleMeter({ meter, value, note }) {
  const widthAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: value,
      duration: 1000,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [value]);

  return (
    <View style={s.styleMeter}>
      <View style={s.meterTop}>
        <Text style={s.meterLabel}>{meter.label}</Text>
        <Text style={[s.meterValue, { color: meter.color }]}>{value}%</Text>
      </View>
      <Text style={s.styleDesc}>{meter.description}</Text>
      <View style={s.track}>
        <Animated.View style={[s.fill, {
          width: widthAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
          backgroundColor: meter.color,
        }]} />
      </View>
      {(note?.instances || []).map((inst, i) => (
        <View key={i} style={i > 0 ? s.styleInstance : s.styleInstanceFirst}>
          <Text style={s.styleExample}>From your call: “{inst.quote}”</Text>
          {inst.why ? <Text style={s.styleReason}>{inst.why}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function InsightsScreen({ conv, onHome, onTranscript }) {
  const { styles, blocks, styleNotes } = resolveInsights(conv);
  return (
    <View style={s.scr}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={onHome} style={s.iconbtn}>
          <Text style={{ color: 'rgba(255,255,255,.6)', fontSize: 16 }}>⌂</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.convTtl}>{conv.title}</Text>
      <Text style={s.convMeta}>
        with {conv.person_name || ''} · {conv.duration} · {conv.created_at?.slice(0, 10)}
      </Text>
      <ScrollView style={{ flex: 1 }}>
        <Text style={s.stylesIntro}>{STYLES_INTRO}</Text>
        <Text style={s.stylesRef}>
          Based on SCCR communication styles (passive, aggressive, passive-aggressive, assertive).
        </Text>
        {STYLE_METERS.map((m) => (
          <StyleMeter
            key={m.key}
            meter={m}
            value={styles[m.key]}
            note={styleNotes[m.key]}
          />
        ))}
        <Text style={s.label}>INSIGHTS</Text>
        {blocks.map((block, i) => (
          <InsightBlock key={i} block={block} />
        ))}
        <TouchableOpacity onPress={onTranscript} style={s.viewTx}>
          <Text style={s.viewTxTx}>View full transcript →</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function DidWellBlock({ block }) {
  const meta = BLOCK_META.did_well;
  const instances =
    block.instances ||
    (block.quote ? [{ quote: block.quote, why: block.why }] : []);
  return (
    <View style={s.icard}>
      <View style={s.icardH}>
        <View style={[s.dot, { backgroundColor: meta.color }]} />
        <Text style={[s.icardT, { color: meta.color }]}>{meta.title}</Text>
      </View>
      {instances.map((inst, i) => (
        <View key={i} style={i > 0 ? s.didWellItem : undefined}>
          <Text style={s.icardQuote}>“{inst.quote}”</Text>
          {inst.why ? <Text style={s.icardB}>{inst.why}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function InsightBlock({ block }) {
  if (block.type === 'legacy') {
    return (
      <>
        {block.tend ? <InsightCard color="#e8a23d" title="You tend to…" body={block.tend} /> : null}
        {block.try ? <InsightCard color="#b8a0d4" title="Try to…" body={block.try} /> : null}
        {block.used ? <InsightCard color="#9b8cf0" title="You used…" body={block.used} /> : null}
      </>
    );
  }
  if (block.type === 'did_well' || block.type === 'went_well') {
    return <DidWellBlock block={block} />;
  }
  const meta = BLOCK_META[block.type] || { title: block.type, color: '#b8a0d4' };
  return (
    <View style={s.icard}>
      <View style={s.icardH}>
        <View style={[s.dot, { backgroundColor: meta.color }]} />
        <Text style={[s.icardT, { color: meta.color }]}>{meta.title}</Text>
      </View>
      <Text style={s.icardQuote}>“{block.quote}”</Text>
      {block.why ? <Text style={s.icardB}>{block.why}</Text> : null}
      {block.instead ? (
        <View style={s.icardInstead}>
          <Text style={s.icardInsteadLbl}>Try instead</Text>
          <Text style={s.icardInsteadTx}>“{block.instead}”</Text>
        </View>
      ) : null}
    </View>
  );
}

function InsightCard({ color, title, body }) {
  return (
    <View style={s.icard}>
      <View style={s.icardH}>
        <View style={[s.dot, { backgroundColor: color }]} />
        <Text style={[s.icardT, { color }]}>{title}</Text>
      </View>
      <Text style={s.icardB}>{body}</Text>
    </View>
  );
}

function TranscriptScreen({ conv, messages, onBack, onNew }) {
  return (
    <View style={s.scr}>
      <View style={s.hd}>
        <TouchableOpacity onPress={onBack}>
          <Text style={s.back}>‹ Insights</Text>
        </TouchableOpacity>
        <Text style={s.ttl}>Transcript</Text>
        <Text style={s.sub}>{conv.title} · with {conv.person_name || ''}</Text>
      </View>
      <ScrollView style={s.txScroll}>
        {messages.map((m, i) => (
          <View key={i} style={[s.bub, m.role === 'me' ? s.bubMe : s.bubThem]}>
            <Text style={s.bubWho}>{m.role === 'me' ? 'Me' : conv.person_name}</Text>
            <Text style={m.role === 'me' ? s.bubMeTx : s.bubThemTx}>{m.content}</Text>
          </View>
        ))}
      </ScrollView>
      <TouchableOpacity onPress={onBack} style={s.cta}>
        <Text style={s.ctaTx}>Back to insights</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onNew} style={[s.cta, s.ctaGhost]}>
        <Text style={s.ctaGhostTx}>New rehearsal</Text>
      </TouchableOpacity>
    </View>
  );
}

function HistoryScreen({ history, person, onOpen, onBack }) {
  return (
    <View style={s.scr}>
      <View style={s.hd}>
        <TouchableOpacity onPress={onBack}>
          <Text style={s.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={s.ttl}>{person ? `With ${person.name}` : 'Previous conversations'}</Text>
        <Text style={s.sub}>Your past rehearsals</Text>
      </View>
      <ScrollView style={s.hist}>
        {history.length === 0 && (
          <Text style={s.empty}>
            {person
              ? `No rehearsals with ${person.name} yet.`
              : 'No rehearsals yet — finish a call to see it here.'}
          </Text>
        )}
        {history.map((c, i) => (
          <TouchableOpacity key={c.id} onPress={() => onOpen(c.id)} style={s.hrow}>
            <View style={[s.hav, { backgroundColor: colorFor(i) + '2e' }]}>
              <Text style={[s.havTx, { color: colorFor(i) }]}>{c.person_name[0]}</Text>
            </View>
            <View style={s.hinfo}>
              <Text style={s.htitle}>{c.title}</Text>
              <Text style={s.hmeta}>{c.person_name} · {c.duration} · {c.created_at?.slice(0, 10)}</Text>
            </View>
            <View style={[s.htension, { backgroundColor: assertiveColor(c.assertive ?? c.tension) + '22' }]}>
              <Text style={[s.htensionTx, { color: assertiveColor(c.assertive ?? c.tension) }]}>
                {c.assertive ?? c.tension}%
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0e0e1a' },
  scr: { flex: 1 },
  hd: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  ttl: { fontSize: 23, fontWeight: '600', color: '#f0e6d3', lineHeight: 28 },
  sub: { fontSize: 13, color: 'rgba(255,255,255,.45)', marginTop: 4 },
  back: { color: '#c4a96e', fontSize: 13, marginBottom: 10 },
  label: { fontSize: 11, color: 'rgba(255,255,255,.3)', paddingHorizontal: 24, marginTop: 16, marginBottom: 10, letterSpacing: 0.8 },

  // Choose
  people: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', paddingHorizontal: 24, paddingTop: 30, paddingBottom: 10 },
  person: { alignItems: 'center', gap: 9, marginBottom: 12 },
  peopleScroll: { paddingHorizontal: 0, paddingBottom: 12 },
  footer: { paddingHorizontal: 20, paddingBottom: 20 },
  pcircle: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center' },
  pcircleText: { fontSize: 24, fontWeight: '600' },
  pname: { fontSize: 12, color: 'rgba(255,255,255,.55)' },
  addnew: { width: '100%', padding: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,.15)', borderRadius: 14, backgroundColor: 'transparent' },
  addnewTx: { color: 'rgba(255,255,255,.5)', fontSize: 14, textAlign: 'center' },

  // Describe
  ta: { marginHorizontal: 24, marginVertical: 6, backgroundColor: 'rgba(255,255,255,.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,.1)', borderRadius: 16,
    padding: 14, minHeight: 130, color: '#f0e6d3', fontSize: 14, lineHeight: 22 },
  reltag: { marginHorizontal: 24, marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,.4)' },
  callbtn: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#3ec46a',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 18, marginBottom: 8,
    shadowColor: '#3ec46a', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  calltext: { textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,.4)', marginBottom: 12 },
  prev: { marginHorizontal: 20, marginTop: 'auto', marginBottom: 26, padding: 14,
    backgroundColor: 'rgba(255,255,255,.05)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,.08)' },
  prevTx: { color: 'rgba(255,255,255,.55)', fontSize: 13, textAlign: 'center' },

  // Call
  callWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  callName: { fontSize: 30, fontWeight: '600', color: '#f0e6d3' },
  timer: { fontSize: 15, color: 'rgba(255,255,255,.4)', marginTop: 6 },
  callAvatar: { width: 92, height: 92, borderRadius: 46, backgroundColor: 'rgba(196,169,110,.18)',
    borderWidth: 2, borderColor: '#c4a96e', alignItems: 'center', justifyContent: 'center', marginVertical: 22 },
  callAvatarTx: { fontSize: 34, fontWeight: '600', color: '#c4a96e' },
  wave: { flexDirection: 'row', gap: 4, alignItems: 'center', height: 32, marginBottom: 16 },
  waveBar: { width: 4, backgroundColor: '#b8a0d4', borderRadius: 2 },
  miniTranscript: { width: '100%', maxHeight: 100, marginBottom: 12 },
  mini: { maxWidth: '85%', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12, marginBottom: 6 },
  miniMe: { alignSelf: 'flex-end', backgroundColor: 'rgba(196,169,110,.14)' },
  miniThem: { alignSelf: 'flex-start', backgroundColor: 'rgba(184,160,212,.1)' },
  miniMeTx: { fontSize: 12, color: '#f0e6d3', lineHeight: 17 },
  miniThemTx: { fontSize: 12, color: 'rgba(255,255,255,.75)', lineHeight: 17 },
  callInput: { flexDirection: 'row', gap: 8, width: '100%', marginBottom: 16 },
  callInputField: { flex: 1, backgroundColor: 'rgba(255,255,255,.06)',
    borderWidth: 1, borderColor: 'rgba(184,160,212,.25)', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, color: '#f0e6d3', fontSize: 13 },
  micBtn: { width: 42, height: 44, borderRadius: 12, backgroundColor: 'rgba(184,160,212,.2)', alignItems: 'center', justifyContent: 'center' },
  micBtnActive: { backgroundColor: 'rgba(229,77,77,.3)' },
  sendBtn: { width: 42, borderRadius: 12, backgroundColor: '#b8a0d4', alignItems: 'center', justifyContent: 'center' },
  sendBtnTx: { color: '#0e0e1a', fontSize: 16, fontWeight: '600' },
  endBtn: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#e54d4d',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#e54d4d', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  hint: { fontSize: 11, color: 'rgba(255,255,255,.3)', marginTop: 10 },

  // Insights
  topbar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 24, paddingTop: 6, paddingBottom: 2 },
  iconbtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,.1)', alignItems: 'center', justifyContent: 'center' },
  convTtl: { fontSize: 21, fontWeight: '600', color: '#f0e6d3', paddingHorizontal: 24, paddingTop: 10, paddingBottom: 2 },
  convMeta: { fontSize: 12, color: 'rgba(255,255,255,.35)', paddingHorizontal: 24, paddingBottom: 14 },
  meter: { marginHorizontal: 24, marginBottom: 16 },
  styleMeter: { marginHorizontal: 24, marginBottom: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.06)' },
  stylesIntro: { marginHorizontal: 24, marginBottom: 8, fontSize: 12, lineHeight: 18, color: 'rgba(255,255,255,.45)' },
  stylesRef: { marginHorizontal: 24, marginBottom: 14, fontSize: 11, lineHeight: 16, color: '#9b8cf0' },
  styleDesc: { fontSize: 11, lineHeight: 16, color: 'rgba(255,255,255,.4)', marginBottom: 8 },
  styleInstanceFirst: { marginTop: 8 },
  styleInstance: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.06)' },
  styleExample: { fontSize: 12, color: '#f0e6d3', fontStyle: 'italic', lineHeight: 18 },
  styleReason: { marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,.55)', lineHeight: 18 },
  meterTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  meterLabel: { fontSize: 13, color: 'rgba(255,255,255,.6)' },
  meterValue: { fontSize: 13, fontWeight: '600' },
  track: { height: 8, backgroundColor: 'rgba(255,255,255,.08)', borderRadius: 6, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6 },
  icard: { marginHorizontal: 24, marginBottom: 11, backgroundColor: 'rgba(255,255,255,.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,.08)', borderRadius: 14, padding: 13 },
  icardH: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  icardT: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  icardB: { fontSize: 13, color: 'rgba(255,255,255,.6)', lineHeight: 20 },
  icardQuote: { fontSize: 13, color: '#f0e6d3', fontStyle: 'italic', lineHeight: 20, marginBottom: 8 },
  icardInstead: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.08)' },
  icardInsteadLbl: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6bc48a', fontWeight: '600', marginBottom: 4 },
  icardInsteadTx: { fontSize: 13, color: 'rgba(255,255,255,.75)', lineHeight: 20 },
  didWellItem: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.08)' },
  viewTx: { marginHorizontal: 24, marginTop: 8, marginBottom: 18, padding: 13,
    backgroundColor: 'rgba(196,169,110,.1)', borderWidth: 1, borderColor: 'rgba(196,169,110,.25)', borderRadius: 12 },
  viewTxTx: { textAlign: 'center', fontSize: 13, color: '#c4a96e' },

  // Transcript
  txScroll: { flex: 1, paddingHorizontal: 20 },
  bub: { maxWidth: '82%', paddingHorizontal: 13, paddingVertical: 10, borderRadius: 15, marginBottom: 10 },
  bubMe: { alignSelf: 'flex-end', backgroundColor: 'rgba(196,169,110,.14)',
    borderWidth: 1, borderColor: 'rgba(196,169,110,.2)', borderBottomRightRadius: 4 },
  bubThem: { alignSelf: 'flex-start', backgroundColor: 'rgba(184,160,212,.1)',
    borderWidth: 1, borderColor: 'rgba(184,160,212,.18)', borderBottomLeftRadius: 4 },
  bubWho: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3, opacity: 0.6, color: '#f0e6d3' },
  bubMeTx: { fontSize: 13, color: '#f0e6d3', lineHeight: 19 },
  bubThemTx: { fontSize: 13, color: 'rgba(255,255,255,.75)', lineHeight: 19 },

  // CTA
  cta: { marginHorizontal: 24, marginTop: 14, backgroundColor: '#c4a96e', borderRadius: 13, padding: 14 },
  ctaTx: { color: '#0e0e1a', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  ctaGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,.12)', marginTop: 10, marginBottom: 18 },
  ctaGhostTx: { color: 'rgba(255,255,255,.4)', fontSize: 14, textAlign: 'center' },

  // History
  hist: { flex: 1, paddingHorizontal: 20 },
  hrow: { flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,.07)',
    borderRadius: 14, padding: 13, marginBottom: 9 },
  hav: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  havTx: { fontSize: 16, fontWeight: '600' },
  hinfo: { flex: 1 },
  htitle: { fontSize: 14, color: '#f0e6d3', fontWeight: '500' },
  hmeta: { fontSize: 12, color: 'rgba(255,255,255,.4)', marginTop: 2 },
  htension: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, flexShrink: 0 },
  htensionTx: { fontSize: 11 },
  empty: { color: 'rgba(255,255,255,.4)', fontSize: 13, textAlign: 'center', paddingTop: 30, paddingHorizontal: 10 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.7)', alignItems: 'center', justifyContent: 'center' },
  modalBox: { backgroundColor: '#1c1c2d', borderRadius: 20, padding: 24, width: '80%', gap: 12 },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#f0e6d3', marginBottom: 4 },
  modalInput: { backgroundColor: 'rgba(255,255,255,.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,.1)',
    borderRadius: 12, padding: 12, color: '#f0e6d3', fontSize: 14 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalCancel: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,.12)', alignItems: 'center' },
  modalCancelTx: { color: 'rgba(255,255,255,.4)', fontSize: 14 },
  modalConfirm: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: '#c4a96e', alignItems: 'center' },
  modalConfirmTx: { color: '#0e0e1a', fontSize: 14, fontWeight: '600' },
});
