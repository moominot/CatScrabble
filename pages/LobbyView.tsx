import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createGame, getPublicGames } from '../services/gameService';
import { GameMode } from '../types';
import { Users, User, BookOpen, Dumbbell, Plus, RefreshCw, ArrowRight } from 'lucide-react';

const MODES: { mode: GameMode; label: string; desc: string; icon: React.ReactNode; min: number; max: number }[] = [
  { mode: 'classica',        label: 'Clàssica',          desc: '2–4 jugadors, torns alternats',         icon: <Users className="w-5 h-5" />,    min: 2, max: 4 },
  { mode: 'classica_1v1',    label: '1 vs 1',            desc: '2 jugadors, opció d\'impugnació',        icon: <User className="w-5 h-5" />,     min: 2, max: 2 },
  { mode: 'duplicada_solo',  label: 'Duplicada Solo',    desc: 'Practica el format competitiu sol',     icon: <BookOpen className="w-5 h-5" />, min: 1, max: 1 },
  { mode: 'entrenament',     label: 'Entrenament',       desc: 'Tauler lliure, IA sempre visible',      icon: <Dumbbell className="w-5 h-5" />, min: 1, max: 1 },
];

const LobbyView: React.FC = () => {
  const navigate = useNavigate();
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [playerName, setPlayerName] = useState(localStorage.getItem('cat_player_name') || '');
  const [selectedMode, setSelectedMode] = useState<GameMode>('classica');
  const [allowChallenge, setAllowChallenge] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadGames(); }, []);

  const loadGames = async () => {
    setLoading(true);
    try { setGames(await getPublicGames()); }
    catch { setGames([]); }
    finally { setLoading(false); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      localStorage.setItem('cat_player_name', playerName.trim());
      const gameId = await createGame(playerName.trim(), selectedMode, { allowChallenge });
      const route = selectedMode === 'entrenament' ? '/training' : selectedMode === 'duplicada_solo' ? '/solo' : '/game';
      navigate(`${route}?gameId=${gameId}&host=1`);
    } catch (err: any) {
      setError(err.message ?? 'Error creant la partida');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoin = (gameId: string, mode: GameMode) => {
    const route = mode === 'entrenament' ? '/training' : mode === 'duplicada_solo' ? '/solo' : '/game';
    navigate(`${route}?gameId=${gameId}`);
  };

  const modeInfo = MODES.find(m => m.mode === selectedMode)!;

  return (
    <div className="min-h-screen bg-pearl-50 text-teal-800 font-sans selection:bg-moss-100">

      <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">

        {/* Header */}
        <div className="text-center space-y-2">
          <p className="text-xs font-bold tracking-[0.3em] text-stone-500 uppercase">Scrabble Català</p>
          <h1 className="text-6xl md:text-8xl font-bold tracking-tight text-teal-800">CatScrabble</h1>
          <div className="h-px w-10 bg-stone-200 mx-auto mt-4" />
        </div>

        <div className="grid md:grid-cols-12 gap-8 items-start">

          {/* Partides actives */}
          <div className="md:col-span-7 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-teal-700">Partides obertes</h2>
              <button onClick={loadGames} className="flex items-center gap-1 text-xs font-bold text-teal-500 hover:text-teal-600 transition-colors">
                <RefreshCw className="w-3 h-3" /> Actualitzar
              </button>
            </div>

            {loading ? (
              <div className="bg-white border border-stone-200 rounded-lg p-8 text-center">
                <div className="w-6 h-6 border-2 border-mist-200 border-t-teal-500 rounded-full animate-spin mx-auto mb-2" />
                <p className="text-stone-500 text-sm">Cercant...</p>
              </div>
            ) : games.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-lg p-8 text-center">
                <p className="text-stone-500 text-sm">No hi ha partides obertes.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {games.map(g => (
                  <div key={g.id} className="bg-white border border-stone-200 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-teal-700">{g.hostName}</p>
                      <p className="text-xs text-stone-500">{MODES.find(m => m.mode === g.mode)?.label ?? g.mode} · {g.playerCount ?? 0} jugadors</p>
                    </div>
                    <button
                      onClick={() => handleJoin(g.id, g.mode)}
                      className="bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-md font-bold text-sm transition-colors flex items-center gap-2"
                    >
                      Unir-se <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Crear partida */}
          <div className="md:col-span-5 sticky top-8">
            <div className="bg-white border border-stone-200 rounded-lg p-6">
              <h2 className="text-lg font-bold text-teal-700 flex items-center gap-2 mb-5 pb-4 border-b border-stone-100">
                <Plus className="w-4 h-4" /> Nova Partida
              </h2>

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-stone-600 mb-1 uppercase tracking-wide">El teu nom</label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={e => setPlayerName(e.target.value)}
                    placeholder="Ex: Joan Puig"
                    className="w-full p-3 bg-pearl-50 border-2 border-stone-200 rounded-md text-teal-700 font-medium focus:ring-2 focus:ring-mist-100 focus:border-mist-400 outline-none transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-600 mb-2 uppercase tracking-wide">Modalitat</label>
                  <div className="grid grid-cols-2 gap-2">
                    {MODES.map(m => (
                      <button
                        key={m.mode}
                        type="button"
                        onClick={() => setSelectedMode(m.mode)}
                        className={`flex items-center gap-2 p-3 rounded-md border-2 text-left transition-all ${
                          selectedMode === m.mode
                            ? 'border-teal-500 bg-moss-50 text-teal-700'
                            : 'border-stone-200 text-stone-600 hover:border-stone-300'
                        }`}
                      >
                        {m.icon}
                        <div>
                          <p className="font-bold text-xs">{m.label}</p>
                          <p className="text-[10px] text-stone-500 leading-tight">{m.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {selectedMode === 'classica_1v1' && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowChallenge}
                      onChange={e => setAllowChallenge(e.target.checked)}
                      className="w-4 h-4 accent-teal-500"
                    />
                    <span className="text-sm text-teal-700 font-medium">Activar sistema d'impugnació</span>
                  </label>
                )}

                {error && (
                  <p className="text-xs text-coral-500 bg-coral-50 border border-coral-200 rounded-md p-2">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={isCreating || !playerName.trim()}
                  className="w-full py-3 bg-teal-800 hover:bg-teal-700 text-white font-bold rounded-md transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isCreating ? 'Creant...' : 'CREAR I ENTRAR'} {!isCreating && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LobbyView;
