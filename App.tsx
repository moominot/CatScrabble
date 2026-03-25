import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import LobbyView from './pages/LobbyView';
import ClassicGameView from './pages/ClassicGameView';
import TrainingView from './pages/TrainingView';
import SoloView from './pages/SoloView';

const App: React.FC = () => (
  <HashRouter>
    <Routes>
      <Route path="/" element={<LobbyView />} />
      <Route path="/game" element={<ClassicGameView />} />
      <Route path="/training" element={<TrainingView />} />
      <Route path="/solo" element={<SoloView />} />
    </Routes>
  </HashRouter>
);

export default App;
