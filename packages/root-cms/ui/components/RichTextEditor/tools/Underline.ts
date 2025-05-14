const TAG = 'U';

export class Underline {
  private api: any;
  private button: HTMLButtonElement;
  private iconClasses: Record<string, string>;

  static get CSS() {
    return '';
  }

  static get shortcut() {
    return 'CMD+U';
  }

  constructor(options: any) {
    this.api = options.api;
    this.button = document.createElement('button');
    this.iconClasses = {
      base: this.api.styles.inlineToolButton,
      active: this.api.styles.inlineToolButtonActive,
    };
  }

  static get isInline() {
    return true;
  }

  render() {
    // Avoid a race condition where the component is destroyed before the
    // render() function is called.
    // https://github.com/blinkk/rootjs/issues/482
    if (!this.button) {
      return null;
    }
    this.button.type = 'button';
    this.button.classList.add(this.iconClasses.base);
    this.button.innerHTML = this.toolboxIcon;
    return this.button;
  }

  surround(range: Range) {
    if (!range) {
      return;
    }

    const termWrapper = this.api.selection.findParentTag(TAG, Underline.CSS);

    if (termWrapper) {
      this.unwrap(termWrapper);
    } else {
      this.wrap(range);
    }
  }

  wrap(range: Range) {
    const el = document.createElement(TAG);
    el.appendChild(range.extractContents());
    range.insertNode(el);
    this.api.selection.expandToTag(el);
  }

  unwrap(termWrapper: HTMLElement) {
    this.api.selection.expandToTag(termWrapper);
    const sel = window.getSelection()!;
    const range = sel.getRangeAt(0);
    const unwrappedContent = range.extractContents();
    termWrapper.parentNode!.removeChild(termWrapper);
    range.insertNode(unwrappedContent);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  checkState() {
    const termTag = this.api.selection.findParentTag(TAG, Underline.CSS);
    this.button.classList.toggle(this.iconClasses.active, !!termTag);
  }

  get toolboxIcon() {
    return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 7.5V11.5C9 12.2956 9.31607 13.0587 9.87868 13.6213C10.4413 14.1839 11.2044 14.5 12 14.5C12.7956 14.5 13.5587 14.1839 14.1213 13.6213C14.6839 13.0587 15 12.2956 15 11.5V7.5" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.71429 18H16.2857" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  static get sanitize() {
    return {
      u: {},
    };
  }
}

export default Underline;
