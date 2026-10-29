import type { ComponentProps, HTMLAttributes, ReactNode } from 'react';
import { FLOATING_CARD, PANEL_BODY, SIDEBAR_CARD_SURFACE, PANEL_ENTER, PANEL_TITLE, PANEL_TITLE_BAR, SIDEBAR_CARD, SIDEBAR_CARD_MAX_H, SIDEBAR_PANEL_WIDTH } from '../../styles';

interface PanelProps extends ComponentProps<'div'> {
  /** Anchor below the search bar on the left, at the shared sidebar card width and height (needs --sidebar-left). */
  sidebar?: boolean;
  /** The sidebar cards' surface without the placement: a card stacked inside a sidebar slot. */
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

/** The panel's top bar. With `title` it draws the shared heading: an optional icon, the title, and an action (a report flag) at the right end. */
export function PanelTitleBar({ className = '', title, icon, action, children, ...rest }: HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode;
  icon?: ReactNode;
  /** Pulled up so it does not make the bar taller. */
  action?: ReactNode;
}) {
  return (
    <div className={className ? `${PANEL_TITLE_BAR} ${className}` : PANEL_TITLE_BAR} {...rest}>
      {title != null ? (
        <>
          {icon}
          <span className={PANEL_TITLE}>{title}</span>
          {action && <div className="ml-auto -my-1">{action}</div>}
        </>
      ) : children}
    </div>
  );
}

export function PanelBody({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={className ? `${PANEL_BODY} ${className}` : PANEL_BODY} {...rest} />;
}
