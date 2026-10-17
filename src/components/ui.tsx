/**
 * The shared control vocabulary. Every button, toggle, tool state and panel in
 * the chrome is one of these, so a new screen (the graph editor, the quiz)
 * inherits the same states instead of restyling them. See CONTRIBUTING
 * "Controls".
 *
 * The accent has exactly two jobs here: a filled `primary` is the action to
 * take, and a pressed chip is the current selection. Nothing else is orange.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { Link } from '../router/router';

/** Keyboard focus, identical on every control. */
export const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-focus';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'border-accent bg-accent text-on-accent hover:border-accent-hover hover:bg-accent-hover active:border-accent-press active:bg-accent-press disabled:border-line disabled:bg-raised disabled:text-fg-mute',
  secondary:
    'border-edge text-fg hover:border-fg-mute hover:bg-raised active:bg-edge disabled:text-fg-mute disabled:hover:border-edge disabled:hover:bg-transparent',
  ghost:
    'border-transparent text-fg-dim hover:bg-raised hover:text-fg active:bg-edge disabled:text-fg-mute disabled:hover:bg-transparent',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-6 px-2 text-micro',
  md: 'h-8 px-3 text-meta',
  lg: 'h-10 px-4 text-ui',
};

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md'): string {
  return `inline-flex shrink-0 items-center justify-center gap-2 rounded-sm border font-display font-semibold font-stretch-semi-condensed whitespace-nowrap transition-colors disabled:cursor-not-allowed ${SIZE[size]} ${VARIANT[variant]} ${FOCUS_RING}`;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
}

export function Button({ variant, size, className, type, ...rest }: ButtonProps): ReactNode {
  return (
    <button
      type={type ?? 'button'}
      className={`${buttonClass(variant, size)} ${className ?? ''}`}
      {...rest}
    />
  );
}

export interface ButtonLinkProps {
  readonly to: string;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly className?: string;
  readonly children: ReactNode;
}

/** A button that navigates. Only ever points at a route that exists. */
export function ButtonLink({ to, variant, size, className, children }: ButtonLinkProps): ReactNode {
  return (
    <Link to={to} className={`${buttonClass(variant, size)} ${className ?? ''}`}>
      {children}
    </Link>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Required: an icon button has no visible text. */
  readonly label: string;
  readonly variant?: ButtonVariant;
  readonly size?: 'sm' | 'md';
}

export function IconButton({ label, variant = 'ghost', size = 'md', className, title, type, ...rest }: IconButtonProps): ReactNode {
  const box = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';
  return (
    <button
      type={type ?? 'button'}
      aria-label={label}
      title={title ?? label}
      className={`inline-flex shrink-0 items-center justify-center rounded-sm border transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${box} ${VARIANT[variant]} ${FOCUS_RING} ${className ?? ''}`}
      {...rest}
    />
  );
}

/**
 * A chip is the one shape for every on/off or one-of-many choice: a filter, a
 * speed mark, and later a graph-editor tool or a quiz answer. `pressed`
 * undefined makes it a plain action chip; true/false makes it a toggle and
 * sets aria-pressed.
 */
export function chipClass(pressed: boolean | undefined): string {
  const tone =
    pressed === true
      ? 'border-accent-line bg-accent-wash text-fg'
      : pressed === false
        ? 'border-transparent text-fg-mute hover:bg-raised hover:text-fg active:bg-edge'
        : 'border-line text-fg-dim hover:border-edge hover:bg-raised hover:text-fg active:bg-edge';
  return `inline-flex min-h-6 min-w-6 items-center justify-center gap-1 rounded-xs border px-1.5 py-0.5 text-micro transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${tone} ${FOCUS_RING}`;
}

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> {
  readonly pressed?: boolean;
}

export function Chip({ pressed, className, type, ...rest }: ChipProps): ReactNode {
  return (
    <button
      type={type ?? 'button'}
      aria-pressed={pressed}
      className={`${chipClass(pressed)} ${className ?? ''}`}
      {...rest}
    />
  );
}

/** A label for a group of chips, so the group reads as one control. */
export function ChipGroup({ label, className, children }: { label: string; className?: string; children: ReactNode }): ReactNode {
  return (
    <div role="group" aria-label={label} className={`flex flex-wrap items-center gap-0.5 ${className ?? ''}`}>
      {children}
    </div>
  );
}

/**
 * A docked panel's header: a lowercase label in the display face, with an
 * optional readout on the right. Panels are separated by hairlines, never by
 * gaps or shadows.
 */
export function PanelHeader({ title, meta, children }: { title: string; meta?: ReactNode; children?: ReactNode }): ReactNode {
  return (
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-1.5">
      <h2 className="font-display text-micro font-semibold font-stretch-semi-condensed text-fg-dim">{title}</h2>
      {meta !== undefined && <span className="font-mono text-micro tabular-nums text-fg-mute">{meta}</span>}
      {children}
    </header>
  );
}

export function Kbd({ children }: { children: ReactNode }): ReactNode {
  return <kbd className="rounded-xs border border-line px-1 font-mono text-micro text-fg-dim">{children}</kbd>;
}
