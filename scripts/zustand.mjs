// Zeigt, ob agent-desktop in dieser Umgebung benutzbar ist (Hilfsskript für die Fehlersuche).
import { agentState } from '../server/agent.js';

console.log('Zustand:', await agentState());
