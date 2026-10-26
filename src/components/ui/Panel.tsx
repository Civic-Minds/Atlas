import type { ComponentProps, HTMLAttributes } from 'react';
import { FLOATING_CARD, PANEL_BODY, SIDEBAR_CARD_SURFACE, PANEL_ENTER, PANEL_TITLE_BAR, SIDEBAR_CARD, SIDEBAR_CARD_MAX_H, SIDEBAR_PANEL_WIDTH } from '../../styles';

interface PanelProps extends ComponentProps<'div'> {
  /** Anchor below the search bar on the left, at the shared sidebar card width and height (needs --sidebar-left). */
  sidebar?: boolean;
  /** The sidebar cards' surface (smaller shadow) without the placement: a card stacked inside a sidebar slot. */
  sidebarSurface?: boolean;
  /** Play the shared entrance animation. */
  enter?: boolean;
}

/** Floating glass card that clips its children and stacks them in a column. Title bar and body are the shared sections. */
export default function Panel({ sidebar = false, sidebarSurface = false, enter = false, className = '', ...rest }: PanelProps) {
  const classes = [
    sidebar ? `${SIDEBAR_CARD} ${SIDEBAR_PANEL_WIDTH} ${SIDEBAR_CARD_MAX_H}` : '',
    sidebar || sidebarSurface ? SIDEBAR_CARD_SURFACE : FLOATING_CARD,
    'flex flex-col overflow-hidden',
    enter ? PANEL_ENTER : '',
    className,
  ].filter(Boolean).join(' ');
  return <div className={classes} {...rest} />;
}

export function PanelTitleBar({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={className ? `${PANEL_TITLE_BAR} ${className}` : PANEL_TITLE_BAR} {...rest} />;
}

export function PanelBody({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={className ? `${PANEL_BODY} ${className}` : PANEL_BODY} {...rest} />;
}
