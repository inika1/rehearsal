import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
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
import { configureCoachSpeech, speakCoachText, stopCoachSpeech } from './shared/coachSpeech.js';
import {
  assertiveColor, displayHeadline, displayIssueSummary,
  resolveInsights, STYLE_METERS,
} from './shared/insightsView.js';

// When testing on a physical device, change this to your machine's local IP.
// e.g. 'http://192.168.1.42:4000'
const API = 'https://rehearsal-production-5d15.up.railway.app';
const SPEECH_SILENCE_MS = 3000;

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

  useEffect(() => {
    configureCoachSpeech(API);
    api.getPeople().then(setPeople);
  }, []);

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
      <StatusBar style="dark" />

      <Modal visible={addingPerson} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Add person</Text>
            <TextInput
              style={s.modalInput}
              placeholder="Name"
              placeholderTextColor="rgba(0,0,0,.3)"
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />
            <TextInput
              style={s.modalInput}
              placeholder="Relationship (e.g. flatmate)"
              placeholderTextColor="rgba(0,0,0,.3)"
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
      <View style={s.choosePad}>
        <Text style={s.ttl}>Choose someone</Text>
        <Text style={s.sub}>Who do you need to talk to?</Text>
      </View>

      <View style={s.chooseCard}>
        <ScrollView bounces={false}>
          {people.map((p, i) => (
            <TouchableOpacity
              key={p.id}
              onPress={() => onPick(p)}
              style={[s.personRow, i < people.length - 1 && s.personRowBorder]}
            >
              <View style={[s.radioCircle, { borderColor: colorFor(i) }]}>
                <Text style={[s.radioInitial, { color: colorFor(i) }]}>{p.name[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.personName}>{p.name}</Text>
                {p.relationship ? (
                  <Text style={s.personRel}>{p.relationship}</Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <TouchableOpacity onPress={onAdd} style={s.addnew}>
        <Text style={s.addnewTx}>＋  Add new person</Text>
      </TouchableOpacity>
    </View>
  );
}

function DescribeScreen({ person, situation, setSituation, onStart, onBack, onHistory }) {
  return (
    <KeyboardAvoidingView style={s.scr} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TouchableOpacity onPress={onBack} style={s.backRow}>
        <Text style={s.back}>‹ Back</Text>
      </TouchableOpacity>

      <View style={s.describeCard}>
        <View style={s.describeAvatar}>
          <Text style={s.describeAvatarTx}>{person.name[0]}</Text>
        </View>
        <Text style={s.describeName}>{person.name}</Text>
        {person.relationship ? (
          <Text style={s.describeRel}>{person.relationship}</Text>
        ) : null}

        <View style={s.describeSection}>
          <Text style={s.describeSectionLabel}>What happened?</Text>
          <TextInput
            style={s.ta}
            placeholder="Is there any further context you want to provide about the conversation? (optional)"
            placeholderTextColor="rgba(0,0,0,.3)"
            value={situation}
            onChangeText={setSituation}
            multiline
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity onPress={onHistory} style={s.prev}>
          <Text style={s.prevTx}>↺  Previous conversations</Text>
        </TouchableOpacity>
      </View>

      <View style={s.callbtnHalo}>
        <View style={s.callbtnRing}>
          <TouchableOpacity onPress={onStart} style={s.callbtn}>
            <Text style={{ fontSize: 28 }}>📞</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={s.calltext}>Tap to start your coaching session</Text>
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
  const [inputHeight, setInputHeight] = useState(44);
  const timer = useRef(null);
  const scrollRef = useRef(null);
  const webRecognition = useRef(null);
  const busyRef = useRef(false);
  const activeRef = useRef(true);
  const sendRef = useRef(null);
  const secsRef = useRef(0);
  const silenceTimer = useRef(null);
  const pendingTextRef = useRef('');
  const recognitionBaseText = useRef('');

  const fmt = (n) =>
    `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

  const stopCallAudio = ({ updateState = true } = {}) => {
    activeRef.current = false;
    busyRef.current = false;
    clearTimeout(silenceTimer.current);
    silenceTimer.current = null;
    pendingTextRef.current = '';
    recognitionBaseText.current = '';
    if (updateState) setListening(false);
    if (Platform.OS === 'web') webRecognition.current?.abort();
    else ExpoSpeechRecognitionModule.stop();
    stopCoachSpeech();
  };

  const scheduleSpeechSend = (text) => {
    if (!activeRef.current) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    pendingTextRef.current = trimmed;
    clearTimeout(silenceTimer.current);
    silenceTimer.current = setTimeout(() => {
      const finalText = pendingTextRef.current.trim();
      pendingTextRef.current = '';
      recognitionBaseText.current = '';
      silenceTimer.current = null;
      setInput('');
      if (finalText && activeRef.current) sendRef.current(finalText);
    }, SPEECH_SILENCE_MS);
  };

  const startListening = async () => {
    if (busyRef.current || !activeRef.current) return;
    if (!pendingTextRef.current) setInput('');
    recognitionBaseText.current = pendingTextRef.current ? `${pendingTextRef.current} ` : '';
    if (Platform.OS === 'web') {
      const w = /** @type {any} */ (window);
      const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
      if (!SR) return;
      const rec = new SR();
      rec.lang = 'en-US';
      rec.continuous = true;
      rec.interimResults = true;
      rec.onstart = () => {
        if (!activeRef.current) {
          rec.abort();
          return;
        }
        setListening(true);
      };
      rec.onresult = (e) => {
        if (!activeRef.current) return;
        const text = `${recognitionBaseText.current}${Array.from(e.results).map((r) => r[0].transcript).join('')}`.trim();
        setInput(text);
        scheduleSpeechSend(text);
      };
      rec.onend = () => {
        setListening(false);
        if (!activeRef.current) return;
        if (pendingTextRef.current.trim() && !silenceTimer.current) scheduleSpeechSend(pendingTextRef.current);
      };
      rec.onerror = () => setListening(false);
      webRecognition.current = rec;
      rec.start();
    } else {
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!activeRef.current) return;
      if (!granted) return;
      setListening(true);
      ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: true });
    }
  };

  const sendText = async (text) => {
    if (!text || busyRef.current) return;
    clearTimeout(silenceTimer.current);
    silenceTimer.current = null;
    pendingTextRef.current = '';
    recognitionBaseText.current = '';
    busyRef.current = true;
    setBusy(true);
    if (Platform.OS === 'web') webRecognition.current?.abort();
    else ExpoSpeechRecognitionModule.stop();
    setMessages((m) => [...m, { role: 'me', content: text }]);
    setInput('');
    setInputHeight(44);
    let reply = '';
    let done = false;
    let audio = null;
    try {
      const data = await api.sendTurn(conversation.id, text);
      if (!activeRef.current) return;
      reply = data?.reply || '';
      done = data?.done || false;
      audio = data?.audio || null;
    } catch (_) {}
    if (!activeRef.current) return;
    if (!reply) reply = "Go on — tell me more.";
    setMessages((m) => [...m, { role: 'them', content: reply }]);
    await speakCoachText(reply, { audioBase64: audio });
    if (!activeRef.current) return;
    busyRef.current = false;
    setBusy(false);
    if (done) {
      stopCallAudio({ updateState: false });
      setTimeout(() => onEnd(fmt(secsRef.current)), 2000);
    }
  };
  sendRef.current = sendText;

  useSpeechRecognitionEvent('result', (event) => {
    if (!activeRef.current) return;
    if (Platform.OS === 'web') return;
    const text = `${recognitionBaseText.current}${event.results[0]?.transcript ?? ''}`.trim();
    setInput(text);
    scheduleSpeechSend(text);
  });

  useSpeechRecognitionEvent('end', () => {
    if (Platform.OS !== 'web') {
      setListening(false);
      if (!activeRef.current) return;
      if (pendingTextRef.current.trim() && !silenceTimer.current) scheduleSpeechSend(pendingTextRef.current);
    }
  });
  useSpeechRecognitionEvent('error', () => {
    if (Platform.OS !== 'web') {
      setListening(false);
    }
  });

  // Auto-start listening whenever idle
  useEffect(() => {
    if (!busy && !listening && activeRef.current) {
      const t = setTimeout(startListening, 300);
      return () => clearTimeout(t);
    }
  }, [busy, listening]);

  useEffect(() => {
    if (!input) setInputHeight(44);
  }, [input]);

  // Timer + speak opening coach message (audio prefetched when conversation started)
  useEffect(() => {
    timer.current = setInterval(() => setSecs((n) => { secsRef.current = n + 1; return n + 1; }), 1000);
    const first = messages.find((m) => m.role === 'them');
    if (first) {
      busyRef.current = true;
      setBusy(true);
      speakCoachText(first.content, { audioBase64: conversation?.opening_audio }).then(() => {
        if (!activeRef.current) return;
        busyRef.current = false;
        setBusy(false);
      });
    }
    return () => {
      clearInterval(timer.current);
      stopCallAudio({ updateState: false });
    };
  }, []);

  return (
    <KeyboardAvoidingView style={s.callWrap} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.callCard}>
        <Text style={s.callName}>Coach</Text>
        <Text style={s.timer}>{fmt(secs)}</Text>
        <View style={s.callAvatar}>
          <Text style={s.callAvatarTx}>C</Text>
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
            <View key={i} style={[s.miniRow, m.role === 'me' ? s.miniRowMe : s.miniRowThem]}>
              {m.role !== 'me' && (
                <View style={s.miniIcon}><Text style={s.miniIconEmoji}>✦</Text></View>
              )}
              <View style={[s.mini, m.role === 'me' ? s.miniMe : s.miniThem]}>
                <Text style={m.role === 'me' ? s.miniMeTx : s.miniThemTx}>{m.content}</Text>
              </View>
              {m.role === 'me' && (
                <View style={[s.miniIcon, s.miniIconMe]}><Text style={s.miniIconEmoji}>♡</Text></View>
              )}
            </View>
          ))}
          {busy && (
            <View style={[s.miniRow, s.miniRowThem]}>
              <View style={s.miniIcon}><Text style={s.miniIconEmoji}>✦</Text></View>
              <View style={[s.mini, s.miniThem]}>
                <Text style={s.miniThemTx}>…</Text>
              </View>
            </View>
          )}
        </ScrollView>
        <View style={s.callInput}>
          <TextInput
            style={[s.callInputField, { height: inputHeight }]}
            value={input}
            placeholder={listening ? 'Listening…' : busy ? 'Coach is replying…' : 'Say something…'}
            placeholderTextColor={listening ? '#1e40af' : 'rgba(0,0,0,.3)'}
            onChangeText={setInput}
            onSubmitEditing={() => sendText(input.trim())}
            returnKeyType="send"
            editable={!listening && !busy}
            multiline
            scrollEnabled={inputHeight >= 96}
            textAlignVertical="top"
            blurOnSubmit
            onContentSizeChange={(event) => {
              const nextHeight = Math.min(Math.max(44, event.nativeEvent.contentSize.height + 8), 96);
              setInputHeight(nextHeight);
            }}
          />
          <TouchableOpacity onPress={() => sendText(input.trim())} style={s.sendBtn}>
            <Text style={s.sendBtnTx}>↑</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity onPress={() => {
        stopCallAudio();
        onEnd(fmt(secs));
      }} style={s.endBtn}>
        <Text style={s.endBtnTx}>📞</Text>
      </TouchableOpacity>
      <Text style={s.hint}>End call to see your insights</Text>
    </KeyboardAvoidingView>
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
    <View style={s.scr}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={onHome} style={s.iconbtn}>
          <Text style={{ color: 'rgba(0,0,0,.5)', fontSize: 20 }}>{'⌂'}</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.insCoachLine}>
        {isGood ? 'You handled this well. Good work.' : 'You did some things well. A few moments are worth noticing.'}
      </Text>
      <Text style={s.convTtl}>{displayHeadline(conv)}</Text>
      {summary ? <Text style={s.convSummary}>{summary}</Text> : null}
      <Text style={s.convMeta}>{'with ' + (conv.person_name || '') + ' · ' + conv.duration}</Text>
      <ScrollView style={{ flex: 1 }}>
        {didWell && <DidWellSection block={didWell} />}
        {horsemen.map((b, i) => <WatchOutSection key={i} block={b} />)}
        <StyleNoteSection meter={dominant} value={styles[dominant.key]} instances={dominantNotes} />
        <View style={{ height: 12 }} />
      </ScrollView>
      <TouchableOpacity onPress={onTranscript} style={s.viewTx}>
        <Text style={s.viewTxTx}>See full transcript</Text>
      </TouchableOpacity>
    </View>
  );
}

function DidWellSection({ block }) {
  const instances = block.instances || (block.quote ? [{ quote: block.quote, why: block.why }] : []);
  return (
    <View style={s.insSection}>
      <Text style={s.insSectionLbl}>What you did well</Text>
      {instances.map((inst, i) => (
        <View key={i} style={i > 0 ? s.insMoment : undefined}>
          <Text style={s.insQuote}>{'“'}{inst.quote}{'”'}</Text>
          {inst.why ? <Text style={s.insNote}>{inst.why}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function WatchOutSection({ block }) {
  return (
    <View style={[s.insSection, s.insSectionWarn]}>
      <Text style={s.insSectionLbl}>A moment to watch</Text>
      <Text style={s.insNote}>{HORSEMAN_INTRO[block.type] || 'You used a pattern worth watching here:'}</Text>
      <Text style={s.insQuote}>{'“'}{block.quote}{'”'}</Text>
      {block.instead ? (
        <View style={s.insInstead}>
          <Text style={s.insInsteadTx}>You could try: {'“'}{block.instead}{'”'}</Text>
        </View>
      ) : null}
    </View>
  );
}

function StyleNoteSection({ meter, value, instances = [] }) {
  return (
    <View style={s.insSection}>
      <Text style={s.insSectionLbl}>How you came across</Text>
      <Text style={[s.insStyleName, { color: meter.color }]}>{meter.label} ({value}%)</Text>
      <Text style={s.insNote}>{meter.description}</Text>
      {instances.map((inst, i) => (
        <View key={i} style={i > 0 ? s.insMoment : undefined}>
          <Text style={s.insQuote}>{'“'}{inst.quote}{'”'}</Text>
          {inst.why ? <Text style={s.insNote}>{inst.why}</Text> : null}
        </View>
      ))}
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
      <View style={s.txCard}>
        <ScrollView style={s.txScroll}>
          {messages.map((m, i) => (
            <View key={i} style={[s.txRow, m.role === 'me' ? s.txRowMe : s.txRowThem]}>
              {m.role !== 'me' && (
                <View style={s.txIcon}><Text style={s.txIconEmoji}>✦</Text></View>
              )}
              <View style={[s.bub, m.role === 'me' ? s.bubMe : s.bubThem]}>
                <Text style={m.role === 'me' ? s.bubMeTx : s.bubThemTx}>{m.content}</Text>
              </View>
              {m.role === 'me' && (
                <View style={[s.txIcon, s.txIconMe]}><Text style={s.txIconEmoji}>♡</Text></View>
              )}
            </View>
          ))}
        </ScrollView>
      </View>
      <TouchableOpacity onPress={onBack} style={s.cta}>
        <Text style={s.ctaTx}>Back to insights</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onNew} style={[s.cta, s.ctaGhost]}>
        <Text style={s.ctaGhostTx}>New conversation</Text>
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
        <Text style={s.sub}>Your past conversations</Text>
      </View>
      <ScrollView style={s.hist}>
        {history.length === 0 && (
          <Text style={s.empty}>
            {person
              ? `No conversations with ${person.name} yet.`
              : 'No conversations yet — finish a session to see it here.'}
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
  root: { flex: 1, backgroundColor: '#fceee9' },
  scr: { flex: 1 },
  hd: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  ttl: { fontSize: 24, fontWeight: '700', color: '#111827', lineHeight: 30 },
  sub: { fontSize: 13, color: 'rgba(0,0,0,.4)', marginTop: 4 },
  back: { color: '#1e3a8a', fontSize: 14, fontWeight: '500' },
  backRow: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 4 },
  label: { fontSize: 11, color: 'rgba(0,0,0,.3)', paddingHorizontal: 24, marginTop: 16, marginBottom: 10, letterSpacing: 0.8 },

  // Choose screen
  choosePad: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16 },
  chooseCard: { marginHorizontal: 20, flex: 1, backgroundColor: '#ffffff', borderRadius: 18,
    borderWidth: 1, borderColor: '#e5e7eb',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    overflow: 'hidden' },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 16 },
  personRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  radioCircle: { width: 42, height: 42, borderRadius: 21, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  radioInitial: { fontSize: 17, fontWeight: '600' },
  personName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  personRel: { fontSize: 12, color: 'rgba(0,0,0,.4)', marginTop: 1 },
  addnew: { marginHorizontal: 20, marginTop: 12, marginBottom: 20, padding: 16, backgroundColor: '#ffffff',
    borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  addnewTx: { color: 'rgba(0,0,0,.5)', fontSize: 15, fontWeight: '500' },

  // Describe screen
  describeCard: { marginHorizontal: 20, marginTop: 8, backgroundColor: '#ffffff',
    borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    padding: 20, flex: 1 },
  describeAvatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#dbeafe',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 10 },
  describeAvatarTx: { fontSize: 28, fontWeight: '700', color: '#1e3a8a' },
  describeName: { fontSize: 20, fontWeight: '700', color: '#111827', textAlign: 'center' },
  describeRel: { fontSize: 13, color: 'rgba(0,0,0,.4)', textAlign: 'center', marginTop: 2, marginBottom: 16 },
  describeSection: { marginTop: 4, marginBottom: 12 },
  describeSectionLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase',
    letterSpacing: 0.7, color: 'rgba(0,0,0,.35)', marginBottom: 8 },
  ta: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 14, padding: 14, minHeight: 160, color: '#111827', fontSize: 14, lineHeight: 22 },
  prev: { marginTop: 'auto', padding: 14, backgroundColor: '#f9fafb', borderRadius: 12,
    borderWidth: 1, borderColor: '#e5e7eb' },
  prevTx: { color: 'rgba(0,0,0,.5)', fontSize: 13, textAlign: 'center' },
  callbtnHalo: { alignSelf: 'center', marginTop: 20, marginBottom: 8, width: 116, height: 116,
    borderRadius: 58, backgroundColor: 'rgba(62,196,106,.07)', alignItems: 'center', justifyContent: 'center' },
  callbtnRing: { width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(62,196,106,.13)',
    alignItems: 'center', justifyContent: 'center' },
  callbtn: { width: 74, height: 74, borderRadius: 37, backgroundColor: '#3ec46a',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#166534', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  calltext: { textAlign: 'center', fontSize: 12, color: 'rgba(0,0,0,.35)', marginBottom: 16 },

  // Call (light theme)
  callWrap: { flex: 1, alignItems: 'center', padding: 20, paddingTop: 12, backgroundColor: '#fceee9' },
  callCard: { width: '100%', flex: 1, backgroundColor: '#ffffff', borderRadius: 24,
    padding: 16, paddingTop: 22, alignItems: 'center', marginBottom: 18,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 2 } },
  callName: { fontSize: 28, fontWeight: '700', color: '#111827' },
  timer: { fontSize: 14, color: 'rgba(0,0,0,.35)', marginTop: 4 },
  callAvatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#dbeafe',
    borderWidth: 2, borderColor: '#93c5fd', alignItems: 'center', justifyContent: 'center', marginBottom: 16, marginTop: 4 },
  callAvatarTx: { fontSize: 32, fontWeight: '700', color: '#1e3a8a' },
  wave: { flexDirection: 'row', gap: 4, alignItems: 'center', height: 32, marginBottom: 14 },
  waveBar: { width: 4, backgroundColor: '#60a5fa', borderRadius: 2 },
  miniTranscript: { width: '100%', flex: 1, marginBottom: 12 },
  miniRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 7, marginBottom: 6 },
  miniRowThem: { justifyContent: 'flex-start' },
  miniRowMe: { justifyContent: 'flex-end' },
  miniIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#dbeafe',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  miniIconMe: { backgroundColor: '#fef9c3' },
  miniIconEmoji: { fontSize: 11, color: '#1e3a8a' },
  mini: { maxWidth: '75%', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12 },
  miniMe: { backgroundColor: 'rgba(232,201,122,.25)', borderRadius: 12, borderBottomRightRadius: 4 },
  miniThem: { backgroundColor: 'rgba(59,130,246,.1)', borderRadius: 12, borderBottomLeftRadius: 4 },
  miniMeTx: { fontSize: 12, color: '#92400e', lineHeight: 17 },
  miniThemTx: { fontSize: 12, color: '#1e3a8a', lineHeight: 17 },
  callInput: { flexDirection: 'row', gap: 8, width: '100%' },
  callInputField: { flex: 1, backgroundColor: '#f8faff',
    borderWidth: 1, borderColor: '#dbeafe', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, color: '#111827', fontSize: 13 },
  micBtn: { width: 42, height: 44, borderRadius: 12, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  micBtnActive: { backgroundColor: 'rgba(229,77,77,.15)' },
  sendBtn: { width: 42, borderRadius: 12, backgroundColor: '#1e3a8a', alignItems: 'center', justifyContent: 'center' },
  sendBtnTx: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  endBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#fecaca',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#ef4444', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  endBtnTx: { fontSize: 24, transform: [{ rotate: '135deg' }] },
  hint: { fontSize: 11, color: 'rgba(0,0,0,.3)', marginTop: 10 },

  // Insights
  topbar: { flexDirection: 'row', justifyContent: 'center', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 6 },
  iconbtn: { width: 46, height: 46, borderRadius: 13, backgroundColor: 'rgba(0,0,0,.05)',
    borderWidth: 1, borderColor: 'rgba(0,0,0,.08)', alignItems: 'center', justifyContent: 'center' },
  convTtl: { fontSize: 21, fontWeight: '600', color: '#111827', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 6 },
  convSummary: { fontSize: 13, lineHeight: 19, color: 'rgba(0,0,0,.5)', paddingHorizontal: 24, paddingBottom: 10 },
  convMeta: { fontSize: 12, color: 'rgba(0,0,0,.3)', paddingHorizontal: 24, paddingBottom: 16 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: 'rgba(0,0,0,.35)',
    paddingHorizontal: 24,
    marginTop: 8,
    marginBottom: 6,
  },
  meter: { marginHorizontal: 24, marginBottom: 16 },
  styleMeter: { marginHorizontal: 24, marginBottom: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,.06)' },
  stylesIntro: { marginHorizontal: 24, marginBottom: 10, fontSize: 12, lineHeight: 18, color: 'rgba(0,0,0,.4)' },
  styleDesc: { fontSize: 11, lineHeight: 16, color: 'rgba(0,0,0,.4)', marginBottom: 8 },
  styleInstanceFirst: { marginTop: 8 },
  styleInstance: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,.06)' },
  styleExample: { fontSize: 12, color: '#111827', fontStyle: 'italic', lineHeight: 18 },
  styleReason: { marginTop: 4, fontSize: 12, color: 'rgba(0,0,0,.5)', lineHeight: 18 },
  meterTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  meterLabel: { fontSize: 13, color: 'rgba(0,0,0,.6)' },
  meterValue: { fontSize: 13, fontWeight: '600' },
  track: { height: 8, backgroundColor: 'rgba(0,0,0,.08)', borderRadius: 6, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6 },
  icard: { marginHorizontal: 24, marginBottom: 11, backgroundColor: '#ffffff',
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, padding: 13 },
  icardH: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  icardT: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: '#111827' },
  icardB: { fontSize: 13, color: 'rgba(0,0,0,.55)', lineHeight: 20 },
  icardQuote: { fontSize: 13, color: '#111827', fontStyle: 'italic', lineHeight: 20, marginBottom: 8 },
  icardInstead: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,.08)' },
  icardInsteadLbl: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#3ec46a', fontWeight: '600', marginBottom: 4 },
  icardInsteadTx: { fontSize: 13, color: 'rgba(0,0,0,.7)', lineHeight: 20 },
  didWellItem: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,.08)' },
  insCoachLine: { fontSize: 17, fontWeight: '500', color: '#1e3a8a', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 6, lineHeight: 24 },
  insSection: { marginHorizontal: 24, marginTop: 16, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, padding: 16 },
  insSectionWarn: { borderColor: 'rgba(229,77,77,.3)' },
  insSectionLbl: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: 'rgba(0,0,0,.35)', marginBottom: 10, fontWeight: '600' },
  insMoment: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,.06)' },
  insQuote: { fontSize: 13, color: '#111827', fontStyle: 'italic', lineHeight: 20, marginBottom: 4 },
  insNote: { fontSize: 13, color: 'rgba(0,0,0,.5)', lineHeight: 20, marginBottom: 6 },
  insInstead: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,.08)' },
  insInsteadTx: { fontSize: 13, color: 'rgba(0,0,0,.7)', lineHeight: 20 },
  insStyleName: { fontSize: 15, fontWeight: '600', marginBottom: 5 },
  viewTx: { marginHorizontal: 24, marginTop: 12, marginBottom: 24, padding: 15,
    backgroundColor: 'rgba(196,169,110,.08)', borderWidth: 1, borderColor: 'rgba(196,169,110,.3)', borderRadius: 12 },
  viewTxTx: { textAlign: 'center', fontSize: 13, color: '#b8860b' },

  // Transcript
  txCard: { flex: 1, marginHorizontal: 20, marginBottom: 8, backgroundColor: '#ffffff',
    borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    overflow: 'hidden' },
  txScroll: { flex: 1, paddingHorizontal: 16, paddingVertical: 12 },
  txRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 10 },
  txRowThem: { justifyContent: 'flex-start' },
  txRowMe: { justifyContent: 'flex-end' },
  txIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#dbeafe',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  txIconMe: { backgroundColor: '#fef9c3' },
  txIconEmoji: { fontSize: 13 },
  bub: { maxWidth: '76%', paddingHorizontal: 13, paddingVertical: 10, borderRadius: 16 },
  bubMe: { backgroundColor: 'rgba(232,201,122,.2)', borderBottomRightRadius: 4 },
  bubThem: { backgroundColor: '#dbeafe', borderBottomLeftRadius: 4 },
  bubWho: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3, opacity: 0.5, color: '#111827' },
  bubMeTx: { fontSize: 13, color: '#92400e', lineHeight: 19 },
  bubThemTx: { fontSize: 13, color: '#1e3a8a', lineHeight: 19 },

  // CTA
  cta: { marginHorizontal: 24, marginTop: 14, backgroundColor: '#dbeafe', borderRadius: 13, padding: 14 },
  ctaTx: { color: '#1e3a8a', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  ctaGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(0,0,0,.12)', marginTop: 10, marginBottom: 18 },
  ctaGhostTx: { color: 'rgba(0,0,0,.4)', fontSize: 14, textAlign: 'center' },

  // History
  hist: { flex: 1, paddingHorizontal: 20 },
  hrow: { flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 14, padding: 13, marginBottom: 9 },
  hav: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  havTx: { fontSize: 16, fontWeight: '600' },
  hinfo: { flex: 1 },
  htitle: { fontSize: 14, color: '#111827', fontWeight: '500' },
  hmeta: { fontSize: 12, color: 'rgba(0,0,0,.4)', marginTop: 2 },
  htension: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, flexShrink: 0 },
  htensionTx: { fontSize: 11 },
  empty: { color: 'rgba(0,0,0,.4)', fontSize: 13, textAlign: 'center', paddingTop: 30, paddingHorizontal: 10 },

  // History header (re-uses hd styles so keep ttl/sub/back compatible)

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.4)', alignItems: 'center', justifyContent: 'center' },
  modalBox: { backgroundColor: '#ffffff', borderRadius: 20, padding: 24, width: '80%', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 },
  modalInput: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 12, padding: 12, color: '#111827', fontSize: 14 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalCancel: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center' },
  modalCancelTx: { color: 'rgba(0,0,0,.4)', fontSize: 14 },
  modalConfirm: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: '#dbeafe', alignItems: 'center' },
  modalConfirmTx: { color: '#1e3a8a', fontSize: 14, fontWeight: '600' },
});
