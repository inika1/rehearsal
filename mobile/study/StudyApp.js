import { View } from 'react-native';
import { BridgeApp } from '../App.js';
import { StudyProvider, useStudy } from './StudyContext.js';
import StudyPanel from './StudyPanel.js';

function StudyShell() {
  const study = useStudy();
  const reserveTopSpace = study && (study.phase === 'welcome' || study.panelExpanded);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, paddingTop: reserveTopSpace ? 210 : 0 }}>
        <BridgeApp />
      </View>
      <StudyPanel />
    </View>
  );
}

export default function StudyApp() {
  return (
    <View style={{ flex: 1 }}>
      <StudyProvider>
        <StudyShell />
      </StudyProvider>
    </View>
  );
}
