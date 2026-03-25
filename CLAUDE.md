# CatScrabble — Context per a Claude Code

## Què és aquest projecte

Fork de **DuplicadaScrabble** (gestor de torneigs Scrabble Duplicat en català) per crear una app de Scrabble clàssic per a 1–4 jugadors. Reutilitza el motor de joc (Board, Tile, scrabbleUtils, moveFinder) però implementa una lògica de torns completament nova.

## Stack tècnic

- React 19 + TypeScript + Vite
- Firebase Realtime Database (SDK compat/legacy — `firebase/compat`)
- Tailwind CSS amb paleta personalitzada (teal/mist/stone/moss/pearl/amber/coral)
- lucide-react per a icones (ja instal·lat)
- React Router v7 (hash-based)

## Paleta de colors (Tailwind custom)

```
teal-500  #347a80  → botons primaris, accents
teal-800  #163a3e  → fons obscurs, text principal fosc
mist-400  #83b2aa  → accents secundaris
stone-300 #d6d9cc  → vores, elements neutres
moss-200  #eff5df  → fons lleuger
pearl-50  #f9f8f5  → fons principal
amber-100 #fdead4  → fons fitxes (Tile)
coral-400 #f06060  → errors, destructiu
```

## Modalitats de joc

| Mode | Jugadors | Notes |
|------|---------|-------|
| `classica` | 2–4 | Torns alternats, bossa compartida |
| `classica_1v1` | 2 | Amb sistema d'impugnació opcional |
| `duplicada_solo` | 1 | Format competitiu en solitari |
| `entrenament` | 1 | Tauler lliure, IA sempre visible |

## Estat actual del codi

### ✅ Completat (commit inicial)

- **`types.ts`**: `GameState`, `GameConfig`, `GameMode`, `Player`, `Move`, `ChallengeState`, `PlacedTile`
- **`services/gameService.ts`**: `createGame`, `joinGame`, `startGame`, `submitMove`, `swapTiles`, `passTurn`, `resolveChallenge`, `getPublicGames`
- **`hooks/useGame.ts`**: `useGame` (subscripció Firebase), `usePlayerRack` (faristol privat)
- **`pages/LobbyView.tsx`**: selector de 4 modalitats, crear i unir-se a partides
- **`components/Board.tsx`** + **`Tile.tsx`**: copiats de DuplicadaScrabble, funcionen igual
- **`utils/scrabbleUtils.ts`** + **`moveFinder.ts`**: motor de joc complet
- **`App.tsx`**: routing `/` → LobbyView, `/game` → ClassicGameView, `/training` → TrainingView, `/solo` → SoloView

### 🔧 Pendents (placeholders)

- **`pages/ClassicGameView.tsx`** → Fase 2 (la més important)
- **`pages/TrainingView.tsx`** → Fase 3
- **`pages/SoloView.tsx`** → Fase 3

## Fase 2: ClassicGameView (PRIORITAT)

La vista principal de joc. Ha de tenir:

### Layout mòbil (pantalla dividida vertical)
```
┌─────────────────────────────┐
│  JOAN 124  ●  MARIA 98      │  ← marcador + torn actiu indicat
│  [Bossa: 47]     [2:30]     │  ← fitxes restants + rellotge torn
├─────────────────────────────┤
│                             │
│   TAULER (15×15)            │  ← pinch-to-zoom + pan
│   amb Board component       │     double-tap → zoom casella
│                             │
├─────────────────────────────┤
│  [A][B][C][D][E][F][G]      │  ← faristol drag&drop
│  tap llarg → reordena       │     arrossegar cap al tauler
├─────────────────────────────┤
│  [ENVIAR] [PASSAR] [CANVIAR]│
│  [IMPUGNAR 12s ●]           │  ← visible al contrincant durant challenge
└─────────────────────────────┘
```

### Funcionalitats clau

1. **Drag & drop fitxa → tauler**: adaptar lògica d'`OnlinePlayerView.tsx` de DuplicadaScrabble
2. **Reordenació del faristol**: drag entre posicions (nou)
3. **Zoom del tauler**: `react-zoom-pan-pinch` o implementació manual amb touch events
4. **Tap-to-place**: tap fitxa faristol → tap casella tauler (alternativa al drag)
5. **Faristol privat**: cada jugador veu NOMÉS el seu faristol (via `usePlayerRack`)
6. **Indicador de torn**: clara distinció visual de qui juga ara
7. **Sistema impugnació**: botó apareix al contrincant durant `challengeWindowSeconds`

### Sistema impugnació (classica_1v1)

```
submitMove() → status='CHALLENGE', challenge.deadline = now + windowSeconds
  ↓
Contrincant veu botó "IMPUGNAR" amb countdown
  ├─ No impugna (timeout) → resolveChallenge('valid') automàtic → status='PLAYING'
  └─ Impugna → resolveChallenge('valid'|'invalid')
       ├─ valid   → impugnador perd torn (ja avançat — penalització addicional)
       └─ invalid → jugador perd punts, retira fitxes
```

### Flux de torn

```typescript
// Jugador actiu fa una jugada:
const { placedTiles, word } = buildMoveFromDraggedTiles(board, rack);
const scoreResult = calculateMoveScore(board, placedTiles, rack, ...);
// Mostrar confirmació
await submitMove(gameId, move, newRack, drawnTiles);
// Firebase actualitza: board, rack, currentTurn, lastMove, history
```

## Firebase estructura

```
games/${gameId}/
  config/          → GameConfig (mode, maxPlayers, allowChallenge...)
  status/          → 'LOBBY' | 'PLAYING' | 'CHALLENGE' | 'FINISHED'
  board/           → BoardCell[][] (15×15)
  bag/             → string[] (fitxes restants)
  players/         → Record<pid, Player>
  turnOrder/       → string[] (ordre de torns)
  currentTurn/     → string (playerId actiu)
  racks/${pid}/    → string[] (faristol privat — llegir SOLO per propietari)
  lastMove/        → Move (última jugada, visible a tothom)
  challenge/       → ChallengeState | null
  history/         → Record<turnNumber, Move>

publicGames/${gameId}/
  hostName, mode, status, playerCount, createdAt
```

## Configuració Firebase pendent

El fitxer `firebaseConfig.ts` té valors placeholder (`"CANVIA_AQUI"`). Cal:
1. Crear projecte Firebase nou (CatScrabble)
2. Activar Realtime Database
3. Substituir les credencials a `firebaseConfig.ts`
4. Desplegar regles: `firebase deploy --only database`

## Com executar

```bash
npm install
npm run dev
```

## Fitxers importants de referència (DuplicadaScrabble)

Si cal consultar implementacions existents (drag&drop, zoom, etc.):
- Drag & drop: `OnlinePlayerView.tsx` línies ~300-420 (touch events, isDragging, handleTouchMove)
- Board zoom: no implementat a DupliCat (nou a CatScrabble)
- Validació jugada: `scrabbleUtils.ts` → `calculateMoveScore()`
- IA millors jugades: `moveFinder.ts` → `findBestMoves(board, rack, limit)`
