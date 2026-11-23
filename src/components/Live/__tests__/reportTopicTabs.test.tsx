import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import ReportTopicTabs, { type ReportTopic } from '../ReportTopicTabs';

const topics: ReportTopic<'a' | 'b'>[] = [
  { key: 'a', title: 'First topic', body: <p>first body</p> },
  { key: 'b', title: 'Second topic', body: <p>second body</p> },
];

function Harness({ start }: { start: 'a' | 'b' }) {
  const [open, setOpen] = useState(start);
  return <ReportTopicTabs topics={topics} open={open} setOpen={setOpen} label="Route 1" />;
}

// CIV-2156: the Live Full report shows one topic at a time behind a row of topic pills.
describe('ReportTopicTabs', () => {
  it('shows only the open topic, and a pill switches topics', () => {
    render(<Harness start="a" />);
    expect(screen.getByRole('group', { name: 'Route 1' })).toBeTruthy();
    expect(screen.getByText('first body')).toBeTruthy();
    expect(screen.queryByText('second body')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Second topic' }));
    expect(screen.getByText('second body')).toBeTruthy();
    expect(screen.queryByText('first body')).toBeNull();
  });

  it('opens on a linked topic', () => {
    render(<Harness start="b" />);
    expect(screen.getByText('second body')).toBeTruthy();
  });
});
