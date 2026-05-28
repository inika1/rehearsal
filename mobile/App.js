import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Animated, Easing, SafeAreaView,
  KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

// When testing on a physical device, change this to your machine's local IP.
// e.g. 'http://192.168.1.42:4000'
const API = 'http://localhost:4000';

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

  const pickPerson = (p) => { setPerson(p); setScreen('describe'); };

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
    setConversation(conv);
    setMessages([]);
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
          onOpen={openConversation} onBack={() => setScreen('describe')} />
      )}
    </SafeAreaView>
  );
}

function ChooseScreen({ people, onPick, onAdd }) {
  return (
    <View style={s.scr}>
      <View style={s.hd}>
        <Text style={s.ttl}>Choose person</Text>
        <Text style={s.sub}>Who do you need to talk to?</Text>
      </View>
      <View style={s.people}>
        {people.slice(0, 3).map((p, i) => (
          <TouchableOpacity key={p.id} onPress={() => onPick(p)} style={s.person}>
            <View style={[s.pcircle, { backgroundColor: colorFor(i) + '2e' }]}>
              <Text style={[s.pcircleText, { color: colorFor(i) }]}>{p.name[0]}</Text>
            </View>
            <Text style={s.pname}>{p.name}</Text>
          </TouchableOpacity>
        ))}
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
  const timer = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    timer.current = setInterval(() => setSecs((n) => n + 1), 1000);
    return () => clearInterval(timer.current);
  }, []);

  const fmt = (n) =>
    `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

  const say = async () => {
    if (!input.trim() || busy) return;
    const mine = { role: 'me', content: input };
    setMessages((m) => [...m, mine]);
    setInput('');
    setBusy(true);
    const { reply } = await api.sendTurn(conversation.id, mine.content);
    setMessages((m) => [...m, { role: 'them', content: reply }]);
    setBusy(false);
  };

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
          <View style={s.miniThem}>
            <Text style={s.miniThemTx}>…</Text>
          </View>
        )}
      </ScrollView>
      <View style={s.callInput}>
        <TextInput
          style={s.callInputField}
          value={input}
          placeholder={`Say something to ${person.name}…`}
          placeholderTextColor="rgba(255,255,255,.3)"
          onChangeText={setInput}
          onSubmitEditing={say}
          returnKeyType="send"
        />
        <TouchableOpacity onPress={say} style={s.sendBtn}>
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

function AnimatedMeter({ name, value, color }) {
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
    <View style={s.meter}>
      <View style={s.meterTop}>
        <Text style={s.meterLabel}>{name}</Text>
        <Text style={[s.meterValue, { color }]}>{value}%</Text>
      </View>
      <View style={s.track}>
        <Animated.View style={[s.fill, {
          width: widthAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
          backgroundColor: color,
        }]} />
      </View>
    </View>
  );
}

function InsightsScreen({ conv, onHome, onTranscript }) {
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
        <AnimatedMeter name="Tension" value={conv.tension} color={tColor(conv.tension)} />
        <AnimatedMeter name="Emotional control" value={conv.emotion} color="#b8a0d4" />
        <Text style={s.label}>INSIGHTS</Text>
        <InsightCard color="#e8a23d" title="You tend to…" body={conv.insight_tend} />
        <InsightCard color="#b8a0d4" title="Try to…" body={conv.insight_try} />
        <InsightCard color="#9b8cf0" title="You used…" body={conv.insight_used} />
        <TouchableOpacity onPress={onTranscript} style={s.viewTx}>
          <Text style={s.viewTxTx}>View full transcript →</Text>
        </TouchableOpacity>
      </ScrollView>
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
            <View style={[s.htension, { backgroundColor: tColor(c.tension) + '22' }]}>
              <Text style={[s.htensionTx, { color: tColor(c.tension) }]}>{c.tension}%</Text>
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
  people: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 24, paddingTop: 30, paddingBottom: 10 },
  person: { alignItems: 'center', gap: 9 },
  pcircle: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center' },
  pcircleText: { fontSize: 24, fontWeight: '600' },
  pname: { fontSize: 12, color: 'rgba(255,255,255,.55)' },
  addnew: { marginHorizontal: 20, marginTop: 'auto', marginBottom: 26, padding: 16,
    borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,.15)', borderRadius: 14 },
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
