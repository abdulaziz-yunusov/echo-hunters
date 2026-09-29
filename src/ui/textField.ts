import { THEME } from '@/config/theme';

/**
 * A real HTML text box laid over the canvas (typing, pasting and phone
 * keyboards all just work). Game keys ignore it while it has focus.
 */
export class TextField {
  private readonly input: HTMLInputElement;

  constructor(options: { placeholder: string; maxLength: number; onEnter(): void }) {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = options.placeholder;
    input.maxLength = options.maxLength;
    input.autocomplete = 'off';
    input.spellcheck = false;
    Object.assign(input.style, {
      position: 'fixed',
      left: '50%',
      transform: 'translateX(-50%)',
      width: '220px',
      padding: '10px 12px',
      font: `24px ${THEME.font}`,
      letterSpacing: '6px',
      textAlign: 'center',
      textTransform: 'uppercase',
      color: THEME.colors.cyan,
      background: '#000',
      border: `1px solid ${THEME.colors.cyan}`,
      outline: 'none',
      zIndex: '20',
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') options.onEnter();
    });
    document.body.appendChild(input);
    this.input = input;
    input.focus();
  }

  get value(): string {
    return this.input.value.trim().toUpperCase();
  }

  /** Place it vertically (CSS px from the top). */
  setTop(y: number): void {
    this.input.style.top = `${Math.round(y)}px`;
  }

  remove(): void {
    this.input.remove();
  }
}
