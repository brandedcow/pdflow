const blessed = require('blessed');
const contrib = require('blessed-contrib');

const screen = blessed.screen({
  smartCSR: true,
  title: 'pdflow Dev Dashboard'
});

const grid = new contrib.grid({
  rows: 12,
  cols: 12,
  screen: screen
});

const expoLog = grid.set(0, 0, 11, 7, blessed.log, {
  label: ' Expo ',
  border: { type: 'line' },
  scrollable: true
});

const backendLog = grid.set(0, 7, 5, 5, blessed.log, {
  label: ' Backend ',
  border: { type: 'line' },
  scrollable: true
});

const workerLog = grid.set(5, 7, 6, 5, blessed.log, {
  label: ' Worker ',
  border: { type: 'line' },
  scrollable: true
});

const footer = grid.set(11, 0, 1, 12, blessed.text, {
  content: ' q: Quit | r: Restart Backend | s: Clear Logs',
  style: { fg: 'black', bg: 'white' }
});

screen.key(['q', 'C-c'], () => process.exit(0));

screen.render();
