import AsyncStorage from '@react-native-async-storage/async-storage';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated, Easing,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text, TextInput, TouchableOpacity,
  View,
} from 'react-native';

const { width: SW } = Dimensions.get('window');
import { configureCoachSpeech, speakCoachText, stopCoachSpeech } from './shared/coachSpeech.js';
import {
  assertiveColor, displayHeadline, displayIssueSummary,
  resolveInsights, STYLE_METERS,
} from './shared/insightsView.js';

// When testing on a physical device, change this to your machine's local IP.
// e.g. 'http://192.168.1.42:4000'
const API = 'https://rehearsal-production-5d15.up.railway.app';
const SPEECH_SILENCE_MS = 1750;

// Auth token — set once on login/startup, included in every request.
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
  signup: (email, password) =>
    fetch(`${API}/api/auth/signup`, {
      method: 'POST', headers: h(), body: JSON.stringify({ email, password }),
    }).then(j),
  login: (email, password) =>
    fetch(`${API}/api/auth/login`, {
      method: 'POST', headers: h(), body: JSON.stringify({ email, password }),
    }).then(j),
  getPeople: () => fetch(`${API}/api/people`, { headers: h() }).then(j),
  addPerson: (name, relationship) =>
    fetch(`${API}/api/people`, {
      method: 'POST', headers: h(), body: JSON.stringify({ name, relationship }),
    }).then(j),
  startConversation: (person_id, title, situation) =>
    fetch(`${API}/api/conversations`, {
      method: 'POST', headers: h(), body: JSON.stringify({ person_id, title, situation }),
    }).then(j),
  sendTurn: (id, content) =>
    fetch(`${API}/api/conversations/${id}/turn`, {
      method: 'POST', headers: h(), body: JSON.stringify({ content }),
    }).then(j),
  finish: (id, duration) =>
    fetch(`${API}/api/conversations/${id}/finish`, {
      method: 'POST', headers: h(), body: JSON.stringify({ duration }),
    }).then(j),
  history: (personId) =>
    fetch(`${API}/api/conversations${personId ? `?person_id=${personId}` : ''}`,
      { headers: h() }).then(j),
  getConversation: (id) => fetch(`${API}/api/conversations/${id}`, { headers: h() }).then(j),
  deleteConversation: (id) =>
    fetch(`${API}/api/conversations/${id}`, { method: 'DELETE', headers: h() }).then(j),
  deletePerson: (id) =>
    fetch(`${API}/api/people/${id}`, { method: 'DELETE', headers: h() }).then(j),
};

const AVATAR_COLORS = ['#c4a96e', '#b8a0d4', '#9b8cf0', '#e8a23d', '#3ec46a'];
const colorFor = (i) => AVATAR_COLORS[i % AVATAR_COLORS.length];
const tColor = (t) => (t >= 65 ? '#e54d4d' : t >= 45 ? '#e8a23d' : '#3ec46a');

function confirmDestructive(title, message, actionText, onConfirm) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: actionText, style: 'destructive', onPress: onConfirm },
  ]);
}

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
  const [addingPerson, setAddingPerson] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRel, setNewRel] = useState('');
  const [noInput, setNoInput] = useState(false);

  // Restore session on startup
  useEffect(() => {
    configureCoachSpeech(API);
    AsyncStorage.getItem('auth_token').then(async (token) => {
      if (token) {
        api.setToken(token);
        const data = await api.getPeople().catch(() => null);
        if (Array.isArray(data)) {
          setPeople(data);
          const stored = await AsyncStorage.getItem('auth_user').catch(() => null);
          setUser(stored ? JSON.parse(stored) : { token });
        } else {
          // Token invalid — clear and show login
          await AsyncStorage.multiRemove(['auth_token', 'auth_user']);
          api.setToken(null);
        }
      }
      setAuthReady(true);
    });
  }, []);

  const handleAuth = async (token, userObj) => {
    api.setToken(token);
    await AsyncStorage.setItem('auth_token', token);
    await AsyncStorage.setItem('auth_user', JSON.stringify(userObj));
    const data = await api.getPeople().catch(() => []);
    if (Array.isArray(data)) setPeople(data);
    setUser(userObj);
  };

  const handleLogout = async () => {
    await AsyncStorage.multiRemove(['auth_token', 'auth_user']);
    api.setToken(null);
    setUser(null);
    setPeople([]);
    setPerson(null);
    setConversation(null);
    setMessages([]);
    setScreen('choose');
  };

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

  const endCall = async (duration, hasInput) => {
    if (!hasInput) {
      await api.deleteConversation(conversation.id).catch((err) => {
        console.warn('Failed to delete empty conversation', err.message);
      });
      setConversation(null);
      setNoInput(true);
      setScreen('insights');
      return;
    }
    setNoInput(false);
    const updated = await api.finish(conversation.id, duration);
    setConversation(updated);
    setScreen('insights');
  };

  const deleteConv = async () => {
    if (!conversation) return;
    try {
      await api.deleteConversation(conversation.id);
      setConversation(null);
      setScreen('choose');
    } catch (err) {
      Alert.alert('Could not delete conversation', err.message);
    }
  };

  const deleteContact = async () => {
    if (!person) return;
    try {
      await api.deletePerson(person.id);
      setPeople((ps) => ps.filter((p) => p.id !== person.id));
      setPerson(null);
      setScreen('choose');
    } catch (err) {
      Alert.alert('Could not delete contact', err.message);
    }
  };

  const deleteHistoryConv = async (id) => {
    try {
      await api.deleteConversation(id);
      setHistory((h) => h.filter((c) => c.id !== id));
    } catch (err) {
      Alert.alert('Could not delete conversation', err.message);
    }
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

  if (!authReady) {
    return (
      <SafeAreaView style={s.root}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: '#111827', marginBottom: 8 }}>Rehearsal</Text>
          <Text style={{ color: 'rgba(0,0,0,.35)', fontSize: 14 }}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={s.root}>
        <StatusBar style="dark" />
        <LoginScreen onAuth={handleAuth} />
      </SafeAreaView>
    );
  }

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
        <ChooseScreen people={people} onPick={pickPerson} onAdd={() => setAddingPerson(true)}
          userEmail={user?.email} onLogout={handleLogout} />
      )}
      {screen === 'describe' && (
        <DescribeScreen person={person} situation={situation} setSituation={setSituation}
          onStart={startCall} onBack={() => setScreen('choose')} onHistory={openHistory}
          onDeletePerson={deleteContact} />
      )}
      {screen === 'call' && (
        <CallScreen person={person} conversation={conversation}
          messages={messages} setMessages={setMessages} onEnd={endCall} />
      )}
      {screen === 'insights' && (
        <InsightsScreen conv={conversation} noInput={noInput}
          onHome={() => { setNoInput(false); setScreen('choose'); }}
          onTranscript={() => setScreen('transcript')}
          onDeleteConversation={deleteConv} />
      )}
      {screen === 'transcript' && (
        <TranscriptScreen conv={conversation} messages={messages}
          onBack={() => setScreen('insights')} onNew={() => setScreen('choose')} />
      )}
      {screen === 'history' && (
        <HistoryScreen history={history} person={person}
          onOpen={openConversation} onBack={() => { setSituation(''); setScreen('describe'); }}
          onDeleteConversation={deleteHistoryConv} />
      )}
    </SafeAreaView>
  );
}

function BridgeLogo({ size = 110 }) {
  const navy = '#1e3a8a';
  const cable = '#3b5ea6';
  const w = size;
  const h = size * 0.68;
  // viewBox 0 0 120 82
  return (
    <Svg width={w} height={h} viewBox="0 0 120 82">
      {/* Road deck */}
      <Rect x="0" y="66" width="120" height="6" rx="3" fill={navy} />

      {/* Left tower */}
      <Rect x="24" y="10" width="11" height="58" rx="3" fill={navy} />
      {/* Left tower cap */}
      <Rect x="20" y="7" width="19" height="9" rx="3" fill={navy} />
      {/* Left tower window */}
      <Rect x="27" y="22" width="5" height="7" rx="1.5" fill="#fceee9" opacity="0.6" />

      {/* Right tower */}
      <Rect x="85" y="10" width="11" height="58" rx="3" fill={navy} />
      {/* Right tower cap */}
      <Rect x="81" y="7" width="19" height="9" rx="3" fill={navy} />
      {/* Right tower window */}
      <Rect x="88" y="22" width="5" height="7" rx="1.5" fill="#fceee9" opacity="0.6" />

      {/* Main cable — droops from tower top to tower top */}
      <Path
        d="M 29 13 Q 60 56 91 13"
        stroke={cable}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />

      {/* Suspender cables */}
      <Line x1="41" y1="27" x2="41" y2="66" stroke={cable} strokeWidth="1.5" opacity="0.45" />
      <Line x1="51" y1="33" x2="51" y2="66" stroke={cable} strokeWidth="1.5" opacity="0.45" />
      <Line x1="60" y1="35" x2="60" y2="66" stroke={cable} strokeWidth="1.5" opacity="0.45" />
      <Line x1="69" y1="33" x2="69" y2="66" stroke={cable} strokeWidth="1.5" opacity="0.45" />
      <Line x1="79" y1="27" x2="79" y2="66" stroke={cable} strokeWidth="1.5" opacity="0.45" />

      {/* Anchor points where cables meet towers */}
      <Circle cx="29" cy="13" r="2.5" fill={cable} />
      <Circle cx="91" cy="13" r="2.5" fill={cable} />
    </Svg>
  );
}

function LoginScreen({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError('');
    if (!email.trim() || !password) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    try {
      const result = mode === 'signup'
        ? await api.signup(email.trim(), password)
        : await api.login(email.trim(), password);
      await onAuth(result.token, result.user);
    } catch (e) { setError(e?.message || 'Something went wrong. Please try again.'); }
    setLoading(false);
  };

  const tryDemo = async () => {
    setError('');
    setLoading(true);
    try {
      // Try logging in first; if account doesn't exist yet, create it.
      let result = await api.login('demo@bridge.app', 'demo1234').catch(() => null);
      if (!result?.token) result = await api.signup('demo@bridge.app', 'demo1234');
      await onAuth(result.token, result.user);
    } catch (e) { setError(e?.message || 'Could not load demo. Try again.'); }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={s.scr} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.loginWrap}>
        <View style={s.loginBrand}>
          <BridgeLogo size={110} />
          <Text style={s.loginTitle}>Bridge</Text>
          <Text style={s.loginTagline}>
            {'Closing the gap between '}
            <Text onPress={tryDemo}>{'intention'}</Text>
            {' and understanding'}
          </Text>
        </View>
        <Text style={s.loginSub}>
          {mode === 'login' ? 'Sign in to continue' : 'Create your account'}
        </Text>

        <View style={s.loginCard}>
          <TextInput
            style={s.loginInput}
            placeholder="Email"
            placeholderTextColor="rgba(0,0,0,.3)"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoFocus
          />
          <TextInput
            style={s.loginInput}
            placeholder="Password"
            placeholderTextColor="rgba(0,0,0,.3)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            onSubmitEditing={submit}
            returnKeyType="go"
          />
          {error ? <Text style={s.loginError}>{error}</Text> : null}
          <TouchableOpacity onPress={submit} style={s.loginBtn} disabled={loading}>
            <Text style={s.loginBtnTx}>
              {loading ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>
          <Text style={s.loginSwitch}>
            {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </Text>
        </TouchableOpacity>

        <View style={s.loginDivider}>
          <View style={s.loginDividerLine} />
          <Text style={s.loginDividerTx}>or</Text>
          <View style={s.loginDividerLine} />
        </View>

        <TouchableOpacity onPress={tryDemo} style={s.demoBtn} disabled={loading}>
          <Text style={s.demoBtnTx}>{loading ? '…' : 'Try sample login'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function ChooseScreen({ people, onPick, onAdd, userEmail, onLogout }) {
  return (
    <View style={s.scr}>
      <View style={s.choosePad}>
        <Text style={s.ttl}>Who do you need help talking to?</Text>
        <Text style={s.sub}>Pick someone you need to have a difficult conversation with</Text>
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

      <TouchableOpacity onPress={() => confirmDestructive(
        'Log out',
        userEmail ? `Signed in as ${userEmail}` : 'Log out of your account?',
        'Log out',
        onLogout
      )} style={s.logoutBtn}>
        <Text style={s.logoutTx}>Log out</Text>
      </TouchableOpacity>
    </View>
  );
}

function DescribeScreen({ person, situation, setSituation, onStart, onBack, onHistory, onDeletePerson }) {
  return (
    <KeyboardAvoidingView style={s.scr} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TouchableOpacity onPress={onBack} style={s.backRow}>
        <Text style={s.back}>‹ Back</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <View style={s.describeCard}>
          <View style={s.describeAvatar}>
            <Text style={s.describeAvatarTx}>{person.name[0]}</Text>
          </View>
          <Text style={s.describeName}>{person.name}</Text>
          {person.relationship ? (
            <Text style={s.describeRel}>{person.relationship}</Text>
          ) : null}

          <View style={s.describeSection}>
            <Text style={s.describeSectionLabel}>What happened? (optional)</Text>
            <TextInput
              style={s.ta}
              placeholder="Any context about the conversation?"
              placeholderTextColor="rgba(0,0,0,.3)"
              value={situation}
              onChangeText={setSituation}
              multiline
              textAlignVertical="top"
            />
          </View>

          <View style={s.callbtnHalo}>
            <View style={s.callbtnRing}>
              <TouchableOpacity onPress={onStart} style={s.callbtn}>
                <Text style={{ fontSize: 28 }}>📞</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={s.calltext}>Tap to start your coaching session</Text>
        </View>

        <TouchableOpacity onPress={onHistory} style={s.prev}>
          <Text style={s.prevTx}>↺  Previous conversations</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => confirmDestructive(
            'Delete contact',
            `Remove ${person.name} and all their conversations?`,
            'Delete',
            onDeletePerson
          )}
          style={s.deleteContact}
        >
          <Text style={s.deleteContactTx}>Delete contact</Text>
        </TouchableOpacity>
      </ScrollView>
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
  const [paused, setPaused] = useState(false);
  const [inputHeight, setInputHeight] = useState(44);
  const timer = useRef(null);
  const scrollRef = useRef(null);
  const webRecognition = useRef(null);
  const busyRef = useRef(false);
  const activeRef = useRef(true);
  const pausedRef = useRef(false);
  const pendingCoachRef = useRef(null);
  const coachDeliveryRef = useRef(null);
  const sendRef = useRef(null);
  const secsRef = useRef(0);
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
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
    if (done) {
      stopCallAudio({ updateState: false });
      setTimeout(() => {
        if (!pausedRef.current) onEnd(fmt(secsRef.current), true);
      }, 2000);
    }
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
    pendingTextRef.current = '';
    recognitionBaseText.current = '';
    if (Platform.OS === 'web') webRecognition.current?.abort();
    else ExpoSpeechRecognitionModule.stop();
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
    pendingTextRef.current = trimmed;
    clearTimeout(silenceTimer.current);
    silenceTimer.current = setTimeout(() => {
      const finalText = pendingTextRef.current.trim();
      pendingTextRef.current = '';
      recognitionBaseText.current = '';
      silenceTimer.current = null;
      setInput('');
      if (finalText && activeRef.current && !pausedRef.current) sendRef.current(finalText);
    }, SPEECH_SILENCE_MS);
  };

  const startListening = async () => {
    if (busyRef.current || !activeRef.current || pausedRef.current) return;
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
        if (!activeRef.current || pausedRef.current) {
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
      if (!activeRef.current || pausedRef.current) return;
      if (!granted) return;
      setListening(true);
      ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: true });
    }
  };

  const sendText = async (text) => {
    if (!text || busyRef.current || pausedRef.current) return;
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
    let payload = null;
    try {
      const data = await api.sendTurn(conversation.id, text);
      if (!activeRef.current) return;
      payload = {
        reply: data?.reply || '',
        audio: data?.audio || null,
        done: data?.done || false,
      };
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
  sendRef.current = sendText;

  useSpeechRecognitionEvent('result', (event) => {
    if (!activeRef.current || pausedRef.current) return;
    if (Platform.OS === 'web') return;
    const text = `${recognitionBaseText.current}${event.results[0]?.transcript ?? ''}`.trim();
    setInput(text);
    scheduleSpeechSend(text);
  });

  useSpeechRecognitionEvent('end', () => {
    if (Platform.OS !== 'web') {
      setListening(false);
      if (!activeRef.current || pausedRef.current) return;
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
    if (!busy && !listening && activeRef.current && !paused && !pendingCoachRef.current) {
      const t = setTimeout(() => {
        if (!busyRef.current && !pausedRef.current && !pendingCoachRef.current) startListening();
      }, 300);
      return () => clearTimeout(t);
    }
  }, [busy, listening, paused]);

  useEffect(() => {
    if (!input) setInputHeight(44);
  }, [input]);

  useEffect(() => {
    if (paused) return undefined;
    timer.current = setInterval(() => setSecs((n) => { secsRef.current = n + 1; return n + 1; }), 1000);
    return () => clearInterval(timer.current);
  }, [paused]);

  // Speak opening coach message (audio prefetched when conversation started)
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
    return () => {
      stopCallAudio({ updateState: false });
    };
  }, []);

  return (
    <KeyboardAvoidingView style={s.callWrap} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.callCard}>
        <Text style={s.callName}>Coach</Text>
        <Text style={[s.timer, paused && s.timerPaused]}>
          {paused ? `Paused · ${fmt(secs)}` : fmt(secs)}
        </Text>
        <View style={s.callAvatar}>
          <Text style={s.callAvatarTx}>C</Text>
        </View>
        <View style={[s.wave, paused && { opacity: 0.12 }]}>
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
            placeholder={
              paused ? 'Paused — tap resume to continue'
                : listening ? 'Listening…'
                : busy ? 'Coach is replying…'
                : 'Say something…'
            }
            placeholderTextColor={paused ? 'rgba(0,0,0,.35)' : listening ? '#1e40af' : 'rgba(0,0,0,.3)'}
            onChangeText={setInput}
            onSubmitEditing={() => sendText(input.trim())}
            returnKeyType="send"
            editable={!listening && !busy && !paused}
            multiline
            scrollEnabled={inputHeight >= 96}
            textAlignVertical="top"
            blurOnSubmit
            onContentSizeChange={(event) => {
              const nextHeight = Math.min(Math.max(44, event.nativeEvent.contentSize.height + 8), 96);
              setInputHeight(nextHeight);
            }}
          />
          <TouchableOpacity
            onPress={() => sendText(input.trim())}
            style={[s.sendBtn, (listening || busy || paused) && s.sendBtnDisabled]}
            disabled={listening || busy || paused}
          >
            <Text style={s.sendBtnTx}>↑</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        onPress={paused ? resumeCall : pauseCall}
        style={[s.pauseBtn, paused && s.pauseBtnActive]}
      >
        <Text style={[s.pauseBtnTx, paused && s.pauseBtnTxActive]}>
          {paused ? '▶  Resume' : '⏸  Hold'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => {
        stopCallAudio();
        onEnd(fmt(secsRef.current), messagesRef.current.some((m) => m.role === 'me'));
      }} style={s.endBtn}>
        <Text style={s.endBtnTx}>📞</Text>
      </TouchableOpacity>
      <Text style={s.hint}>
        {paused ? 'Session paused — resume when you\'re ready' : 'End call to see your insights'}
      </Text>
    </KeyboardAvoidingView>
  );
}

const HORSEMAN_INTRO = {
  critical: 'You made this sound like a character attack instead of naming the specific thing that happened:',
  contemptuous: 'You let mockery or dismissal come through here, which can shut the conversation down:',
  defensive: 'You sounded like you were deflecting instead of staying with what was said:',
  stonewalling: 'You sounded like you were shutting down instead of staying in the conversation:',
};

function InsightsScreen({ conv, noInput, onHome, onTranscript, onDeleteConversation }) {
  if (noInput) {
    return (
      <View style={s.scr}>
        <View style={s.topbar}>
          <TouchableOpacity onPress={onHome} style={s.iconbtn}>
            <Text style={{ color: 'rgba(0,0,0,.5)', fontSize: 20 }}>{'⌂'}</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 12 }}>
            No input provided
          </Text>
          <Text style={{ fontSize: 14, color: 'rgba(0,0,0,.4)', textAlign: 'center', lineHeight: 22 }}>
            Nothing was said during this session. This conversation hasn't been saved.
          </Text>
        </View>
        <TouchableOpacity onPress={onHome} style={[s.cta, { marginHorizontal: 24, marginBottom: 32 }]}>
          <Text style={s.ctaTx}>Go home</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
        <TouchableOpacity
          onPress={() => confirmDestructive(
            'Delete conversation',
            'This will permanently remove this conversation and cannot be undone.',
            'Delete',
            onDeleteConversation
          )}
          style={s.deleteConvBtn}
        >
          <Text style={s.deleteConvTx}>Delete conversation</Text>
        </TouchableOpacity>
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

function HistoryScreen({ history, person, onOpen, onBack, onDeleteConversation }) {
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
          <View key={c.id} style={s.hrow}>
            <TouchableOpacity onPress={() => onOpen(c.id)} style={s.hopen}>
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
            <TouchableOpacity
              onPress={() => confirmDestructive(
                'Delete conversation',
                'Remove this conversation?',
                'Delete',
                () => onDeleteConversation(c.id)
              )}
              style={s.hdelBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={s.hdelTx}>✕</Text>
            </TouchableOpacity>
          </View>
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
  back: { color: '#1e3a8a', fontSize: 16, fontWeight: '600' },
  backRow: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6, minHeight: 48, justifyContent: 'center' },
  label: { fontSize: 11, color: 'rgba(0,0,0,.3)', paddingHorizontal: 24, marginTop: 16, marginBottom: 10, letterSpacing: 0.8 },

  // Login screen
  loginWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 32 },
  loginBrand: { alignItems: 'center', marginBottom: 28 },
  loginTitle: { fontSize: 36, fontWeight: '800', color: '#111827', textAlign: 'center', marginTop: 10, marginBottom: 8, letterSpacing: -0.5 },
  loginTagline: { fontSize: 13, color: 'rgba(0,0,0,.38)', textAlign: 'center', lineHeight: 19, paddingHorizontal: 16 },
  loginSub: { fontSize: 14, color: 'rgba(0,0,0,.4)', textAlign: 'center', marginBottom: 16 },
  loginCard: { backgroundColor: '#ffffff', borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb',
    padding: 20, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } },
  loginInput: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: '#111827' },
  loginError: { fontSize: 13, color: '#dc2626', textAlign: 'center' },
  loginBtn: { backgroundColor: '#1e3a8a', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 4 },
  loginBtnTx: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  loginSwitch: { color: '#1e3a8a', fontSize: 13, textAlign: 'center', marginTop: 20 },
  loginDivider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22 },
  loginDividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,.1)' },
  loginDividerTx: { fontSize: 12, color: 'rgba(0,0,0,.3)' },
  demoBtn: { marginTop: 12, padding: 14, borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(0,0,0,.12)', alignItems: 'center', backgroundColor: 'rgba(0,0,0,.02)' },
  demoBtnTx: { fontSize: 14, color: 'rgba(0,0,0,.45)', fontWeight: '500' },

  // Choose screen
  choosePad: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16 },
  logoutBtn: { marginHorizontal: 20, marginTop: 10, marginBottom: 20, paddingVertical: 16, paddingHorizontal: 20,
    backgroundColor: 'rgba(229,77,77,.06)', borderRadius: 14, borderWidth: 1,
    borderColor: 'rgba(229,77,77,.22)', alignItems: 'center' },
  logoutTx: { fontSize: 15, color: '#dc2626', fontWeight: '600' },
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
  describeHeader: { alignItems: 'center', paddingTop: 8, paddingBottom: 12 },
  describeCard: { marginHorizontal: 20, marginTop: 8, backgroundColor: '#ffffff',
    borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    padding: 20 },
  describeAvatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#dbeafe',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 10 },
  describeAvatarTx: { fontSize: 28, fontWeight: '700', color: '#1e3a8a' },
  describeName: { fontSize: 20, fontWeight: '700', color: '#111827', textAlign: 'center' },
  describeRel: { fontSize: 13, color: 'rgba(0,0,0,.4)', textAlign: 'center', marginTop: 2, marginBottom: 16 },
  describeSection: { marginTop: 4, marginBottom: 12 },
  describeSectionLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase',
    letterSpacing: 0.7, color: 'rgba(0,0,0,.35)', marginBottom: 8 },
  ta: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 14, padding: 14, minHeight: 120, color: '#111827', fontSize: 14, lineHeight: 22 },
  prev: { marginHorizontal: 20, marginTop: 20, padding: 16, backgroundColor: '#dbeafe', borderRadius: 14,
    borderWidth: 1, borderColor: '#bfdbfe' },
  prevTx: { color: '#1e3a8a', fontSize: 16, fontWeight: '500', textAlign: 'center' },
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
  timerPaused: { color: '#b45309', fontWeight: '600' },
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
  sendBtnDisabled: { opacity: 0.45 },
  sendBtnTx: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  pauseBtn: {
    marginBottom: 12,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  pauseBtnActive: { backgroundColor: '#fff7ed', borderColor: '#fdba74' },
  pauseBtnTx: { fontSize: 14, fontWeight: '600', color: '#374151' },
  pauseBtnTxActive: { color: '#c2410c' },
  endBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#fecaca',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#ef4444', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  endBtnTx: { fontSize: 24, transform: [{ rotate: '135deg' }] },
  hint: { fontSize: 11, color: 'rgba(0,0,0,.3)', marginTop: 10 },

  // Insights
  topbar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
  iconbtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(0,0,0,.05)',
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
  hopen: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  hav: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  havTx: { fontSize: 16, fontWeight: '600' },
  hinfo: { flex: 1 },
  htitle: { fontSize: 14, color: '#111827', fontWeight: '500' },
  hmeta: { fontSize: 12, color: 'rgba(0,0,0,.4)', marginTop: 2 },
  htension: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, flexShrink: 0 },
  htensionTx: { fontSize: 11 },
  empty: { color: 'rgba(0,0,0,.4)', fontSize: 13, textAlign: 'center', paddingTop: 30, paddingHorizontal: 10 },

  // Delete buttons
  deleteContact: { marginHorizontal: 20, marginTop: 10, paddingVertical: 16, paddingHorizontal: 20,
    backgroundColor: 'rgba(229,77,77,.06)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(229,77,77,.22)', alignItems: 'center' },
  deleteContactTx: { color: '#dc2626', fontSize: 15, fontWeight: '600' },
  deleteConvBtn: { marginHorizontal: 24, marginTop: 20, marginBottom: 4,
    paddingVertical: 16, paddingHorizontal: 20,
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(229,77,77,.22)',
    backgroundColor: 'rgba(229,77,77,.05)', alignItems: 'center' },
  deleteConvTx: { color: '#dc2626', fontSize: 15, fontWeight: '600' },
  hdelBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(229,77,77,.1)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  hdelTx: { color: '#dc2626', fontSize: 14, fontWeight: '600' },

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
