// House bots taped out at launch. Players fork these in the Bot Lab.

export const SEED_BOTS = [
  {
    name: "Cautious",
    blurb: "Drives straight. When the way ahead is blocked it turns toward the side with more room.",
    src: `# Straight until blocked, then turn toward the roomier side.
left  = F & RL
right = F & !RL`,
  },
  {
    name: "Lookahead",
    blurb: "Sees two cells ahead and turns early, before it gets boxed in.",
    src: `# Turn one step early, toward the roomier open side.
let danger = F | F2
let goL = danger & RL & !L
left  = goL
right = danger & !goL & !R`,
  },
  {
    name: "Hunter",
    blurb: "Steers toward the opponent's head whenever that is safe.",
    src: `# Chase: when the opponent is behind me, swing toward its side.
let chase = !OF & !F2
left  = (F & RL) | (!F & chase & OL & !L)
right = (F & !RL) | (!F & chase & !OL & !R)`,
  },
  {
    name: "Coward",
    blurb: "Keeps its distance: turns away whenever the opponent is ahead.",
    src: `# Flee: if the opponent is ahead, turn away from its side.
let flee = OF & !F
left  = (F & RL) | (flee & !OL & !L)
right = (F & !RL) | (flee & OL & !R)`,
  },
  {
    name: "Weaver",
    blurb: "Zig-zags on a coin flip, using one bit of memory so it never turns the same way twice in a row.",
    src: `# One memory bit remembers the last turn; weave left, right, left...
mem lastLeft
let free = !F & !F2
let weave = free & COIN
let goL = (F & RL) | (weave & !lastLeft & !L)
let goR = (F & !RL) | (weave & lastLeft & !R)
left  = goL
right = goR & !goL
next lastLeft = (lastLeft & !goR) | goL`,
  },
];
