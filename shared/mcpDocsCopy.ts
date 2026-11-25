/**
 * CIV-1900: the words on the MCP docs page (/internal/mcp). New UI text, waiting on Ryan's word-for-word OK. The tool
 * list itself is not here: the page reads it from the tool definitions (scripts/mcp/toolDefs.ts).
 */
export const MCP_DOCS = {
  title: 'MCP',
  // Ryan, 2026-11-22: "in the table of contents the headings should be 1 word". Not asked for: the five words.
  contents: { answers: 'Answers', tools: 'Tools', freshness: 'Freshness', connect: 'Connect', testers: 'Testers', usage: 'Usage' },
  card: 'What the MCP answers, its tools, how fresh its data is and how to connect it.',
  intro: 'The Atlas Studio MCP lets Claude answer a planner’s questions from Atlas’s own data. It only reads Atlas’s published figures; it changes nothing and reaches nothing outside Atlas.',
  answers: {
    heading: 'What it answers',
    items: [
      'How often a route runs in each part of the day, with its first and last trips and its branches.',
      'Which routes run every N min or better, in one agency or across several, and how agencies rank.',
      'Routes near a corner, station or stop, trip times between two stops, and how often any route leaves between them.',
      'How a route’s frequency has changed over the years, from History.',
      'Buses needed for a route, and what changed between two schedules, from Studio’s files.',
      'Where a route’s vehicles are bunched and where riders have waited longest right now, from the last half hour of Live’s recordings.',
      'How a route ran against its schedule and how evenly its vehicles were spaced over past weeks, from Live’s recordings.',
    ],
    outside: 'It has no ridership, crowding or reasons for a change, and it doesn’t say where a single vehicle is. When a tool has no figure, the answer says so.',
  },
  tools: {
    heading: 'Tools',
    intro: 'Every tool, as the MCP describes it to Claude.',
    // Ryan, 2026-11-22: "In the MCP page should the Tools section be a table instead", picked 1: Tool | What it answers | Live.
    name: 'Tool', answers: 'What it answers', live: 'Live',
    liveTag: 'Live',
    // Ryan, 2026-11-22: "For the tools should we group them together at all on the page too"; on the options, "1" (one
    // table, a group label above each set of rows). Group names as proposed: Find, Schedules, Changes, Planning, Live.
    groups: { find: 'Find', schedules: 'Schedules', changes: 'Changes', planning: 'Planning', live: 'Live' },
    liveNote: 'Tools marked Live answer from Live’s recordings.',
  },
  freshness: {
    heading: 'How fresh the data is',
    items: [
      'The hosted server follows each published release by itself, within a minute of it going live.',
      'Every answer gives the hours it covers and the date the agency’s schedule runs to.',
      'Gaps and bunching right now come from the last half hour of Live’s recordings; reliability and bunching history cover past weeks.',
    ],
    version: (v: string) => `Server version ${v}.`,
  },
  connect: {
    heading: 'Connect it',
    // Ryan, 2026-11-22: "I don't want people downloading MCP atlas though i only want them using the hosted version":
    // the page gives the hosted setup only.
    hosted: 'Testers use the hosted server through a private link made for each of them. They add it in Claude as a custom connector.',
    // Ryan, 2026-11-22: "how was elias able to add it to his claude code with a line of code". Not asked for: these words.
    hostedCode: 'In Claude Code, the same link is one command, with nothing to install:',
    hostedLink: '<your link>',
  },
  testers: {
    heading: 'Testers',
    intro: 'Who has a link to the hosted server, and how much they have used it. Choose a name to see their latest questions.',
    unavailable: 'Usage can’t be read: the admin token isn’t on this Mac, or the hosted server didn’t answer.',
    loading: 'Loading…',
    none: 'No testers yet.',
    name: 'Name', since: 'Since', calls: 'Calls', lastWeek: 'Calls, last 7 days', questions: 'Questions', questionsLastWeek: 'Questions, last 7 days', status: 'Status',
    active: 'Active', revoked: 'Link stopped',
    question: 'Question', tool: 'Tool', when: 'When',
    noQuestion: 'No question given',
    failed: 'failed',
    noCalls: 'No calls yet.',
    // CIV-2202 (Ryan, 2026-11-24: make and stop tester links on this page). Not asked for: these words. CIV-2944 (Ryan,
    // 2026-11-25, on a Stop link beside every row: "We don't need this beside every of them"): it sits in the tester's view.
    stop: 'Stop link',
    confirmStop: (name: string) => `Stop ${name}’s link? It stops working at once and can’t be turned back on.`,
    stopFailed: 'The link wasn’t stopped.',
    newLink: {
      heading: 'New link',
      name: 'Name',
      make: 'Make link',
      shownOnce: (name: string) => `${name}’s link. Copy it now: it is shown only once.`,
      failed: 'The link wasn’t made.',
    },
  },
  // Ryan, 2026-11-22: "The MCP page could also have a chart for the usage at the bottom if we wanted too", then "Do both".
  usage: {
    heading: 'Usage',
    // CIV-2944 (Ryan, 2026-11-25: "Why not show questions and calls as two different lines"): two lines with a key, so the
    // intro no longer sends you to hover for calls. Not asked for: "and calls" in the intro and label, and the axis title.
    intro: (days: number) => `Questions and calls to the hosted server each day, every tester together, over the last ${days} days (UTC).`,
    chartLabel: (days: number) => `Line chart of questions and calls per day over the last ${days} days`,
    axis: 'Per day',
    /** The hover sentence for one day. */
    day: (questions: string, calls: string) => `${questions} questions, ${calls} calls`,
    // Ryan, 2026-11-25: "do 7 days w a toggle for 14 or 28". Not asked for: these words.
    daysLabel: 'Days shown',
    days: (days: number) => `${days} days`,
    partial: 'The earliest days may read low: the server can’t count by day yet, so these come from each tester’s latest calls.',
    none: 'No calls in this period.',
  },
} as const;
