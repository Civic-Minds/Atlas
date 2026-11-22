/**
 * CIV-1900: the words on the MCP docs page (/internal/mcp). New UI text, waiting on Ryan's word-for-word OK. The tool
 * list itself is not here: the page reads it from the tool definitions (scripts/mcp/toolDefs.ts).
 */
export const MCP_DOCS = {
  title: 'MCP',
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
    liveNote: 'Tools marked Live answer from Live’s recordings, on this Mac and on the hosted server.',
  },
  freshness: {
    heading: 'How fresh the data is',
    items: [
      'On this Mac, the MCP reads the newest published release saved here, so it is as fresh as the last time that copy was updated.',
      'The hosted server follows each published release by itself, within a minute of it going live.',
      'Every answer gives the hours it covers and the date the agency’s schedule runs to.',
      'Gaps and bunching right now come from the last half hour of Live’s recordings; reliability and bunching history cover past weeks.',
    ],
    version: (v: string) => `Server version ${v}.`,
  },
  connect: {
    heading: 'Connect it',
    code: 'Claude Code, for every project:',
    desktop: 'Claude Desktop: add this to claude_desktop_config.json, then quit and reopen Claude Desktop:',
    antigravity: 'Gemini, in Antigravity’s CLI (agy):',
    hosted: 'Testers use the hosted server through a private link made for each of them. They add it in Claude as a custom connector.',
  },
  testers: {
    heading: 'Testers',
    intro: 'Who has a link to the hosted server, and how much they have used it. Choose a name to see their latest questions.',
    unavailable: 'Usage can’t be read: the admin token isn’t on this Mac, or the hosted server didn’t answer.',
    loading: 'Loading…',
    none: 'No testers yet.',
    name: 'Name', since: 'Since', calls: 'Calls', lastWeek: 'Last 7 days', status: 'Status',
    active: 'Active', revoked: 'Link stopped',
    question: 'Question', tool: 'Tool', when: 'When',
    noQuestion: 'No question given',
    failed: 'failed',
    noCalls: 'No calls yet.',
  },
} as const;
