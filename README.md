# CatScrabble

Scrabble en català per a 1–4 jugadors. Modalitats:

- **Clàssica** (2–4 jugadors): torns alternats, bossa compartida, faristols privats
- **1 vs 1**: amb sistema d'impugnació opcional
- **Duplicada Solo**: practica el format competitiu en solitari
- **Entrenament**: tauler lliure amb IA sempre visible

## Tecnologia

React 19 + TypeScript + Vite + Firebase Realtime Database + Tailwind CSS

## Instal·lació

```bash
npm install
npm run dev
```

### Configuració Firebase

1. Crea un projecte nou a [Firebase Console](https://console.firebase.google.com/)
2. Activa **Realtime Database** (mode test per començar)
3. Copia les credencials a `firebaseConfig.ts`
4. Aplica les regles: `firebase deploy --only database`

## Estructura

```
pages/          → LobbyView, ClassicGameView, TrainingView, SoloView
components/     → Board, Tile (compartits amb DuplicadaScrabble)
hooks/          → useGame, usePlayerRack
services/       → gameService (createGame, joinGame, submitMove, challenge...)
utils/          → scrabbleUtils, moveFinder (compartits)
types.ts        → GameState, GameConfig, Move, Player...
```

## Relació amb DuplicadaScrabble

`Board`, `Tile`, `scrabbleUtils`, `moveFinder` i `constants` es mantenen sincronitzats manualment entre els dos repositoris. En el futur es pot extreure un paquet `@catscrabble/core`.
