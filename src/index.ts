import { World, PanelUI, Group } from '@iwsdk/core';
import { GameSystem } from './game-system';
import { UISystem } from './ui-system';
import { AudioSystem } from './audio-system';
import { EffectsSystem } from './effects-system';
import { EnvironmentSystem } from './environment-system';

const container = document.getElementById('scene-container') as HTMLDivElement;

const world = await World.create(container, {
  xr: { offer: 'once' },
  input: { canvasPointerEvents: true },
  features: {
    locomotion: { browserControls: true },
  },
  render: {
    near: 0.01,
    far: 200,
    defaultLighting: false,
    camera: { position: [0, 1.6, 5], lookAt: [0, 1.5, 0] },
  },
});

// === Panel Entities ===
const pY = 1.5, pZ = 3.5;
const panelDefs: { key: string; config: string; pos: [number, number, number]; show: boolean }[] = [
  { key: 'menu',     config: './ui/menu.json',      pos: [0, pY, pZ],      show: true },
  { key: 'hud',      config: './ui/hud.json',       pos: [0, 2.3, 3.8],    show: false },
  { key: 'pause',    config: './ui/pause.json',      pos: [0, pY, pZ],      show: false },
  { key: 'results',  config: './ui/results.json',    pos: [0, pY, pZ],      show: false },
  { key: 'achpanel', config: './ui/achpanel.json',    pos: [0, pY, pZ],      show: false },
  { key: 'settings', config: './ui/settings.json',    pos: [0, pY, pZ],      show: false },
  { key: 'stats',    config: './ui/stats.json',       pos: [0, pY, pZ],      show: false },
  { key: 'tutorial', config: './ui/tutorial.json',     pos: [0, pY, pZ],      show: false },
];

const panelEntities: Record<string, any> = {};
const panelPositions: Record<string, [number, number, number]> = {};

for (const pd of panelDefs) {
  const grp = new Group();
  grp.position.set(pd.pos[0], pd.show ? pd.pos[1] : -50, pd.pos[2]);
  grp.scale.set(1.4, 1.4, 1.4);
  const entity = world.createTransformEntity(grp);
  entity.addComponent(PanelUI, { config: pd.config });
  panelEntities[pd.key] = entity;
  panelPositions[pd.key] = pd.pos;
}

world
  .registerSystem(EnvironmentSystem)
  .registerSystem(AudioSystem)
  .registerSystem(EffectsSystem)
  .registerSystem(GameSystem)
  .registerSystem(UISystem);

const game = world.getSystem(GameSystem)!;
const ui = world.getSystem(UISystem)!;
const audio = world.getSystem(AudioSystem)!;
const effects = world.getSystem(EffectsSystem)!;

game.setRefs({ ui, audio, effects });
ui.setRefs({ game, audio, panels: panelEntities, positions: panelPositions });
